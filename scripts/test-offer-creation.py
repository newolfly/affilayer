#!/usr/bin/env python3
"""Regression test: real advertiser offer creation (H-02).

Proves, against the LIVE database with a real advertiser JWT, that the
insert path `createOffer()` in apps/web/src/lib/data.ts works end to end:
  (i)    a throwaway advertiser (approved, member of Test Org) can read
         its own profile row incl. organization_id (the ownership input);
  (ii)   POST /rest/v1/offers with the exact payload createOffer() sends
         creates a live row with the right organization_id / advertiser_id
         / status / payout (CPA);
  (iii)  a CPS offer persists rate_bps (migration 007 column);
  (iv)   the new offer is visible through the marketplace read
         (GET /rest/v1/offers, active catalogue policy);
  (v)    an insert claiming a foreign organization_id is rejected by RLS
         (offers_insert_member);
  (vi)   the audit entry via the log_audit RPC lands bound to the caller;
  (vii)  the advertiser can DELETE its own offers (cleanup path), and
         the throwaway user/profile/audit rows are removed afterwards.

Usage:
  python3 scripts/test-offer-creation.py

Creates ONE throwaway advertiser DIRECTLY in SQL (auth.users +
profiles) — no signup endpoint, so no confirmation email is burned
(built-in sender allows 2/hr). The password is set with pgcrypto
crypt(); all four GoTrue token columns are set to '' (SQL-created users
otherwise 500 on sign-in). Prints PASS/FAIL per case; exit code 0 only
when every case passes and nothing remains.
"""

import json
import secrets as secrets_mod
import subprocess
import sys
import uuid

import psycopg2

SUPABASE_URL = "https://cpaxrqwqyjutrscqvqjp.supabase.co"
ANON_KEY = "sb_publishable_KVkx2s_BCgyvIng7RarhSw_5Sxdc_6w"
ORG_ID = "aaaaaaaa-0000-4000-8000-000000000101"  # Test Org (the only org)
FOREIGN_ORG_ID = "bbbbbbbb-0000-4000-8000-000000000101"  # no such org

failures = []


def check(name, cond, extra=""):
    if cond:
        print(f"PASS {name}")
    else:
        failures.append(name)
        print(f"FAIL {name} {extra}")


def curl(method, path, jwt=None, data=None, headers=None):
    cmd = ["curl", "-s", "-w", "\n%{http_code}", "-X", method,
           f"{SUPABASE_URL}{path}",
           "-H", f"apikey: {ANON_KEY}",
           "-H", "Content-Type: application/json"]
    if jwt:
        cmd += ["-H", f"Authorization: Bearer {jwt}"]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    if data is not None:
        cmd += ["-d", json.dumps(data)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    body, _, status = out.stdout.rpartition("\n")
    try:
        parsed = json.loads(body) if body.strip() else None
    except json.JSONDecodeError:
        parsed = body
    return int(status), parsed


def db():
    secrets = {}
    for line in open("/home/hatch/.affilayer-secrets"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        secrets[k.strip()] = v.strip().strip('"').strip("'")
    pw = (secrets.get("AFFILAYER_SUPABASE_DB_PASSWORD")
          or secrets.get("SUPABASE_DB_PASSWORD"))
    return psycopg2.connect(
        host="aws-0-ap-southeast-1.pooler.supabase.com", port=6543,
        dbname="postgres", user="postgres.cpaxrqwqyjutrscqvqjp",
        password=pw)


def main():
    tag = uuid.uuid4().hex[:8]
    email = f"lucadan777+offer-create-{tag}@gmail.com"
    password = secrets_mod.token_urlsafe(24)
    uid = str(uuid.uuid4())

    conn = db()
    cur = conn.cursor()

    # --- setup: throwaway advertiser, created directly in SQL -----------
    # Direct postgres bypasses the profiles_enforce_role_status trigger
    # (current_user = 'postgres' returns NEW), so organization_id,
    # role and status can be set here — exactly how the seed/admin rows
    # were made. No signup email is sent. Note the on_auth_user_created
    # trigger auto-creates the profiles row on the auth.users insert,
    # so the profile is UPDATEed below, not INSERTed.
    cur.execute(
        "INSERT INTO auth.users (instance_id, id, aud, role, email,"
        " encrypted_password, email_confirmed_at, confirmation_token,"
        " recovery_token, email_change, email_change_token_new,"
        " raw_app_meta_data, raw_user_meta_data, created_at, updated_at)"
        " VALUES ('00000000-0000-0000-0000-000000000000', %s,"
        " 'authenticated', 'authenticated', %s,"
        " crypt(%s, gen_salt('bf')), now(), '', '', '', '',"
        " '{\"provider\": \"email\", \"providers\": [\"email\"]}'::jsonb,"
        " '{}'::jsonb, now(), now())",
        (uid, email, password))
    # The on_auth_user_created trigger already made a profiles row
    # (affiliate / pending / no org); upgrade it in place. Direct
    # postgres bypasses profiles_enforce_role_status (current_user =
    # 'postgres' returns NEW), so role/status/organization_id can be
    # set here — exactly how the seed/admin rows were made.
    # No signup email is sent.
    cur.execute(
        "UPDATE public.profiles SET role = 'advertiser',"
        " status = 'approved', kyc_status = 'not_started',"
        " organization_id = %s WHERE id = %s",
        (ORG_ID, uid))
    conn.commit()
    print(f"test advertiser: {email} uid={uid}")

    status, res = curl("POST", "/auth/v1/token?grant_type=password",
                       data={"email": email, "password": password})
    assert status == 200, f"signin failed: {status} {res}"
    jwt = res["access_token"]

    offer_ids = []
    audit_id = None
    try:
        # --- (i) own profile readable incl. organization_id --------------
        status, res = curl("GET", f"/rest/v1/profiles?id=eq.{uid}&select=id,role,status,organization_id", jwt)
        rows = res if isinstance(res, list) else []
        check("(i) own profile readable with organization_id",
              status == 200 and len(rows) == 1
              and rows[0].get("organization_id") == ORG_ID
              and rows[0].get("role") == "advertiser"
              and rows[0].get("status") == "approved",
              f"http={status} rows={res}")

        # --- (ii) CPA insert: the exact payload createOffer() sends ------
        payload = {
            "organization_id": ORG_ID, "advertiser_id": uid,
            "campaign_id": None, "name": "H-02 Test Offer CPA",
            "description": "Throwaway verification offer",
            "vertical": "Finance", "countries": ["US", "GB"],
            "devices": ["desktop", "mobile"],
            "traffic_sources": ["SEO", "Content"],
            "conversion_type": "Signup", "payout_model": "CPA",
            "payout": 9.99, "rate_bps": None, "currency": "USD",
            "daily_cap": 10, "monthly_cap": None,
            "landing_url": "https://example.com/landing",
            "creatives": ["https://example.com/banner.png"],
            "approval_required": True, "status": "active",
        }
        status, res = curl("POST", "/rest/v1/offers", jwt, payload,
                           {"Prefer": "return=representation"})
        created = res[0] if isinstance(res, list) and res else None
        check("(ii) CPA offer insert returns 201 with row",
              status in (200, 201) and created is not None,
              f"http={status} body={res}")
        if created:
            offer_ids.append(created["id"])
            cur.execute(
                "SELECT organization_id::text, advertiser_id::text,"
                " status, payout, payout_model, currency, rate_bps,"
                " campaign_id FROM public.offers WHERE id = %s",
                (created["id"],))
            row = cur.fetchone()
            print(f"  db row: org={row[0]} adv={row[1]} status={row[2]}"
                  f" payout={row[3]} model={row[4]} ccy={row[5]}"
                  f" rate_bps={row[6]} campaign_id={row[7]}")
            check("(ii) row has correct ownership + fields",
                  row is not None and row[0] == ORG_ID and row[1] == uid
                  and row[2] == "active" and str(row[3]) == "9.99"
                  and row[4] == "CPA" and row[5] == "USD"
                  and row[6] is None and row[7] is None,
                  f"row={row}")

        # --- (iii) CPS insert persists rate_bps --------------------------
        cps = dict(payload)
        cps.update({"name": "H-02 Test Offer CPS", "payout_model": "CPS",
                    "payout": 50.00, "rate_bps": 1500})
        status, res = curl("POST", "/rest/v1/offers", jwt, cps,
                           {"Prefer": "return=representation"})
        created_cps = res[0] if isinstance(res, list) and res else None
        check("(iii) CPS offer insert returns 201 with row",
              status in (200, 201) and created_cps is not None,
              f"http={status} body={res}")
        if created_cps:
            offer_ids.append(created_cps["id"])
            cur.execute("SELECT payout_model, rate_bps FROM public.offers"
                        " WHERE id = %s", (created_cps["id"],))
            row = cur.fetchone()
            check("(iii) CPS rate_bps persisted",
                  row is not None and row[0] == "CPS" and row[1] == 1500,
                  f"row={row}")

        # --- (iv) marketplace read shows the new offer -------------------
        if offer_ids:
            status, res = curl(
                "GET", "/rest/v1/offers?select=id,name,status&order=created_at.desc&limit=10", jwt)
            ids = [r["id"] for r in res] if isinstance(res, list) else []
            check("(iv) new offers visible via marketplace read",
                  status == 200 and all(i in ids for i in offer_ids),
                  f"http={status} ids={ids}")

        # --- (v) foreign-org insert rejected by RLS ----------------------
        bad = dict(payload)
        bad.update({"organization_id": FOREIGN_ORG_ID,
                    "name": "H-02 Foreign Org Offer"})
        status, res = curl("POST", "/rest/v1/offers", jwt, bad,
                           {"Prefer": "return=representation"})
        cur.execute("SELECT count(*) FROM public.offers"
                    " WHERE name = 'H-02 Foreign Org Offer'")
        check("(v) foreign-org insert rejected, no row created",
              status >= 400 and cur.fetchone()[0] == 0,
              f"http={status} body={res}")

        # --- (vi) log_audit RPC binds the actor to the JWT ---------------
        if offer_ids:
            status, res = curl("POST", "/rest/v1/rpc/log_audit", jwt, {
                "p_actor_id": uid, "p_action": "offer.create",
                "p_entity_type": "offer", "p_entity_id": offer_ids[0],
                "p_details": {"name": "H-02 Test Offer CPA"},
            })
            audit_id = res if isinstance(res, str) else None
            check("(vi) log_audit RPC succeeds for own actor",
                  status == 200 and isinstance(res, str),
                  f"http={status} body={res}")
            if audit_id:
                cur.execute("SELECT actor_id::text, action FROM audit_logs"
                            " WHERE id = %s", (audit_id,))
                row = cur.fetchone()
                check("(vi) audit row bound to caller",
                      row is not None and row[0] == uid
                      and row[1] == "offer.create", f"row={row}")

        # --- (vii) advertiser deletes its own offers --------------------
        for oid in list(offer_ids):
            status, res = curl("DELETE", f"/rest/v1/offers?id=eq.{oid}", jwt)
            cur.execute("SELECT count(*) FROM public.offers WHERE id = %s",
                        (oid,))
            gone = cur.fetchone()[0] == 0
            check(f"(vii) offer {oid[:8]}… deleted via REST",
                  status in (200, 204) and gone,
                  f"http={status} body={res} remaining={not gone}")
            if gone:
                offer_ids.remove(oid)
    finally:
        # --- cleanup: nothing remains ------------------------------------
        for oid in offer_ids:
            cur.execute("DELETE FROM public.offers WHERE id = %s", (oid,))
        if audit_id:
            cur.execute("DELETE FROM audit_logs WHERE id = %s", (audit_id,))
        cur.execute("DELETE FROM public.profiles WHERE id = %s", (uid,))
        cur.execute("DELETE FROM auth.users WHERE id = %s", (uid,))
        conn.commit()
        cur.execute("SELECT count(*) FROM public.offers"
                    " WHERE advertiser_id = %s", (uid,))
        offers_left = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM public.profiles WHERE id = %s",
                    (uid,))
        profiles_left = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM auth.users WHERE id = %s", (uid,))
        users_left = cur.fetchone()[0]
        check("cleanup: 0 offers / profiles / users remain",
              offers_left == 0 and profiles_left == 0 and users_left == 0,
              f"offers={offers_left} profiles={profiles_left}"
              f" users={users_left}")
        conn.close()

    if failures:
        print(f"\nFAILED: {len(failures)} case(s): {failures}")
        sys.exit(1)
    print("\nALL H-02 OFFER-CREATION CHECKS PASSED")


if __name__ == "__main__":
    main()

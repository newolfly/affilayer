#!/usr/bin/env python3
"""Regression test: org isolation (H-01) + log_audit actor binding (M-02).

Proves, against the LIVE database with a real affiliate JWT, that:
  (i)   an affiliate cannot self-assign organization_id on UPDATE
         (migration 017 raises; row unchanged);
  (ii)  an affiliate cannot self-assign organization_id on INSERT
         (migration 017 forces it to NULL);
  (iii) an affiliate cannot read another org's rows (RLS holds);
  (iv)  a privileged actor (admin / service role) CAN still assign
         organization_id (positive control, trigger level);
  (v)   an affiliate CAN still update their own non-org fields;
  (vi)  log_audit rejects a forged actor and accepts the caller's own id
         (migration 018 binds p_actor_id to the JWT).

Usage:
  python3 scripts/test-org-isolation.py

Creates ONE throwaway affiliate (signup + SQL email confirmation, the
same pattern as the original RLS negative test), runs the cases with its
real JWT, then deletes the user, profile and affiliate_profiles row and
verifies nothing remains. Burns one Supabase signup confirmation email
(built-in sender allows 2/hr). Prints PASS/FAIL per case; exit code 0
only when every case passes. Uses curl for HTTP (urllib truncates chunked
Supabase auth responses) and direct Postgres for setup/verification.
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
ORG_OFFER_ID = "dddddddd-0000-4000-8000-000000000101"  # its active offer
SUPER_ADMIN_ID = "ec5a6910-d83c-4e13-aaf0-318ebf5d359e"  # forged actor for (vi)

failures = []


def check(name, cond, extra=""):
    if cond:
        print(f"PASS {name}")
    else:
        failures.append(name)
        print(f"FAIL {name} {extra}")


def curl(method, path, jwt=None, data=None):
    cmd = ["curl", "-s", "-w", "\n%{http_code}", "-X", method,
           f"{SUPABASE_URL}{path}",
           "-H", f"apikey: {ANON_KEY}",
           "-H", "Content-Type: application/json"]
    if jwt:
        cmd += ["-H", f"Authorization: Bearer {jwt}"]
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
        password=pw, connect_timeout=20)


def main():
    tag = uuid.uuid4().hex[:8]
    email = f"lucadan777+org-isolation-{tag}@gmail.com"
    password = secrets_mod.token_urlsafe(24)

    conn = db()
    cur = conn.cursor()

    # --- setup: throwaway affiliate -------------------------------------
    # Signup sends a confirmation email (built-in sender allows 2/hr). If
    # the rate limit is hit, reuse the newest org-isolation user from a
    # previous run instead: reset its password via pgcrypto bcrypt and
    # confirm it below. Either way the account is deleted at the end.
    status, res = curl("POST", "/auth/v1/signup",
                       data={"email": email, "password": password})
    if status == 429:
        cur.execute(
            "SELECT id, email FROM auth.users"
            " WHERE email LIKE 'lucadan777+org-isolation-%'"
            " ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
        assert row, "rate-limited and no reusable test user found"
        uid, email = row
        cur.execute(
            "UPDATE auth.users SET encrypted_password = crypt(%s, gen_salt('bf'))"
            " WHERE id = %s", (password, uid))
        conn.commit()
        print(f"signup rate-limited (429) — reusing test affiliate "
              f"{email} uid={uid}")
    else:
        assert status in (200, 201), f"signup failed: {status} {res}"
        uid = (res.get("user") or {}).get("id") or res.get("id")
        assert uid, f"signup response has no user id: {res}"
        print(f"test affiliate: {email} uid={uid}")

    # Confirm the email the way the RLS test did (no confirmation link).
    cur.execute(
        "UPDATE auth.users SET email_confirmed_at = now(),"
        " email_change = '', email_change_token_new = '',"
        " confirmation_token = '', recovery_token = '' WHERE id = %s", (uid,))
    conn.commit()

    status, res = curl("POST", "/auth/v1/token?grant_type=password",
                       data={"email": email, "password": password})
    assert status == 200, f"signin failed: {status} {res}"
    jwt = res["access_token"]

    try:
        # --- (i) UPDATE organization_id must be rejected -----------------
        status, res = curl("PATCH", f"/rest/v1/profiles?id=eq.{uid}", jwt,
                           {"organization_id": ORG_ID})
        cur.execute("SELECT organization_id FROM profiles WHERE id = %s", (uid,))
        org_after = cur.fetchone()[0]
        check("(i) UPDATE organization_id rejected",
              status >= 400 and org_after is None,
              f"http={status} org_after={org_after} body={res}")

        # --- (ii) INSERT with organization_id -> forced NULL ------------
        cur.execute("DELETE FROM profiles WHERE id = %s", (uid,))
        conn.commit()
        status, res = curl("POST", "/rest/v1/profiles", jwt, {
            "id": uid, "email": email, "role": "affiliate",
            "status": "pending", "kyc_status": "not_started",
            "organization_id": ORG_ID,
        })
        cur.execute("SELECT organization_id FROM profiles WHERE id = %s", (uid,))
        row = cur.fetchone()
        if status in (200, 201) and row is not None:
            check("(ii) INSERT organization_id forced to NULL",
                  row[0] is None, f"org={row[0]}")
        elif status >= 400:
            check("(ii) INSERT organization_id rejected", True,
                  f"http={status} (rejected outright — also safe)")
        else:
            check("(ii) INSERT organization_id forced to NULL",
                  False, f"http={status} row={row} body={res}")
        if row is None:
            # INSERT was rejected outright; recreate the row privileged so
            # the remaining cases have a profile to work with.
            cur.execute(
                "INSERT INTO profiles (id, email, role, status, kyc_status)"
                " VALUES (%s, %s, 'affiliate', 'pending', 'not_started')",
                (uid, email))
            conn.commit()

        # --- (iii) cross-org reads must be empty ------------------------
        reads = [
            ("organizations", f"/rest/v1/organizations?id=eq.{ORG_ID}&select=id"),
            ("postback_configs",
             f"/rest/v1/postback_configs?organization_id=eq.{ORG_ID}&select=id"),
            ("campaigns",
             f"/rest/v1/campaigns?organization_id=eq.{ORG_ID}&select=id"),
            ("clicks", "/rest/v1/clicks?select=id&limit=100"),
            ("conversions", "/rest/v1/conversions?select=id&limit=100"),
            ("commission_ledger",
             "/rest/v1/commission_ledger?select=id&limit=100"),
        ]
        all_empty = True
        for name, path in reads:
            status, res = curl("GET", path, jwt)
            rows = res if isinstance(res, list) else None
            if status != 200 or rows is None or len(rows) != 0:
                all_empty = False
                print(f"  (iii) {name}: http={status} rows={res}")
        check("(iii) cross-org reads return []", all_empty)
        # The active catalogue offer IS readable by design
        # (offers_select_active_catalogue) — assert exactly that one.
        status, res = curl(
            "GET", f"/rest/v1/offers?organization_id=eq.{ORG_ID}&select=id", jwt)
        check("(iii) catalogue: only the active offer is visible",
              status == 200 and isinstance(res, list)
              and [r["id"] for r in res] == [ORG_OFFER_ID],
              f"http={status} rows={res}")

        # --- (iv) positive control: privileged actor CAN assign ---------
        cur.execute(
            "UPDATE profiles SET organization_id = %s WHERE id = %s",
            (ORG_ID, uid))
        conn.commit()
        cur.execute("SELECT organization_id FROM profiles WHERE id = %s", (uid,))
        assigned = cur.fetchone()[0]
        check("(iv) privileged actor can assign organization_id "
              "(trigger-level control)", str(assigned) == ORG_ID,
              f"org={assigned}")
        cur.execute(
            "UPDATE profiles SET organization_id = NULL WHERE id = %s", (uid,))
        conn.commit()

        # --- (v) own non-org field update still allowed -----------------
        status, res = curl("PATCH", f"/rest/v1/profiles?id=eq.{uid}", jwt,
                           {"full_name": "Org Isolation Test"})
        cur.execute("SELECT full_name, organization_id FROM profiles WHERE id = %s",
                    (uid,))
        name_after, org_after = cur.fetchone()
        check("(v) own full_name update allowed",
              status in (200, 204) and name_after == "Org Isolation Test"
              and org_after is None,
              f"http={status} name={name_after} org={org_after}")

        # --- (vi) log_audit actor binding (018) -------------------------
        status, res = curl("POST", "/rest/v1/rpc/log_audit", jwt, {
            "p_actor_id": SUPER_ADMIN_ID, "p_action": "test.forged",
            "p_entity_type": "profile", "p_entity_id": uid,
            "p_details": {"test": "org-isolation"},
        })
        check("(vi) log_audit forged actor rejected",
              status in (401, 403), f"http={status} body={res}")
        status, res = curl("POST", "/rest/v1/rpc/log_audit", jwt, {
            "p_actor_id": uid, "p_action": "test.own",
            "p_entity_type": "profile", "p_entity_id": uid,
            "p_details": {"test": "org-isolation"},
        })
        audit_ok = status == 200 and res is not None
        if audit_ok:
            cur.execute(
                "SELECT actor_id FROM audit_logs WHERE action = 'test.own'"
                " AND entity_id = %s ORDER BY created_at DESC LIMIT 1", (uid,))
            row = cur.fetchone()
            audit_ok = row is not None and str(row[0]) == uid
            if row is not None:
                cur.execute(
                    "DELETE FROM audit_logs WHERE action = 'test.own'"
                    " AND entity_id = %s", (uid,))
                conn.commit()
        check("(vi) log_audit own actor accepted + recorded",
              audit_ok, f"http={status} body={res}")
    finally:
        # --- cleanup: remove every trace of the throwaway affiliate ------
        cur.execute("DELETE FROM affiliate_profiles WHERE profile_id = %s", (uid,))
        cur.execute("DELETE FROM profiles WHERE id = %s", (uid,))
        cur.execute("DELETE FROM auth.users WHERE id = %s", (uid,))
        conn.commit()
        cur.execute("SELECT count(*) FROM profiles WHERE id = %s", (uid,))
        left_profiles = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM auth.users WHERE id = %s", (uid,))
        left_users = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM audit_logs WHERE entity_id = %s", (uid,))
        left_audit = cur.fetchone()[0]
        conn.close()
        check("cleanup: test user fully removed",
              left_profiles == 0 and left_users == 0 and left_audit == 0,
              f"profiles={left_profiles} users={left_users} audit={left_audit}")

    print(f"\n{len(failures)} failure(s): {failures}" if failures else "\nALL CASES PASS")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()

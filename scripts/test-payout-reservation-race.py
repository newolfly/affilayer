#!/usr/bin/env python3
"""Phase 1 item 1.7 — true two-session concurrent proof of the migration 019
payout reservation race fix.

What 019 fixed (M-06): approve_payout_request used to SELECT 'approved'
ledger rows with no FOR UPDATE and flip them with no status guard, so two
concurrent approvals for the same affiliate+currency could reserve the same
rows; complete_payout_request then flipped ALL payable rows for the
affiliate+currency to 'paid'. 019 locks the rows (FOR UPDATE + status guard),
persists the reservation in payout_requests.reserved_ledger_row_ids, and makes
complete() lock + flip exactly those ids.

This script proves it concurrently, with two separate database sessions
(two psycopg2 connections in two threads, released by a barrier so both
calls are in flight at the same time):

  Test A — two concurrent approve_payout_request calls for TWO DIFFERENT
           pending requests (R1, R2) for the same affiliate+currency,
           each $0.01, against ONE $0.01 approved ledger row (L1).
           Exactly one must approve and reserve L1; the other must fail
           400 check_violation (exceeds approved balance) after blocking
           on L1's row lock. This targets the exact M-06 window.
  Test B — two concurrent approve_payout_request calls for the SAME
           pending request (R3) against a fresh $0.01 approved row (L2).
           Exactly one approves; the other fails 400 (cannot be approved
           from status approved) after blocking on the request-row lock.
  Test C — two concurrent complete_payout_request calls for the SAME
           approved request (R3). Exactly one completes (one
           payout_transactions row, L2 -> paid once); the other fails 400
           (cannot be completed from status paid).

No real money: every fixture row is $0.01, labelled ITEM-1.7, for the test
affiliate AFF-TEST-001. complete() here only writes DB rows (provider NULL);
it never calls NOWPayments and moves no money externally.

Overlap proof per test: both threads are released by the same barrier and
each records t_start/t_end; the loser must still have been inside its call
when the winner committed (loser.t_start < winner.t_end < loser.t_end), and
a sampler thread polls pg_stat_activity for Lock waits on the RPC during
the run as corroboration. A sequential run cannot produce that pattern.

Residue: commission_ledger rows are undeletable, so L1/L2 ($0.01 each)
stay 'paid' at the end, backed by one payout_transactions row each, and
the paid payout_requests rows stay (deleting them would orphan the paid
ledger rows — the $12.02 class from the 019 header). Everything else
deletable (the losing pending request R2) is removed. All ids are printed.

Usage:
  python3 scripts/test-payout-reservation-race.py [--keep] [--no-cleanup]
  --keep / --no-cleanup: leave R2 pending instead of rejecting+deleting it
      (default: clean up everything deletable).

DB password: read from ~/.affilayer-secrets (AFFILAYER_SUPABASE_DB_PASSWORD)
or $AFFILAYER_SUPABASE_DB_PASSWORD. Never printed.
"""
import argparse
import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.errors

HOST = "aws-0-ap-southeast-1.pooler.supabase.com"
PORT = 6543
DB = "postgres"
USER = "postgres.cpaxrqwqyjutrscqvqjp"
ADMIN_UID = "ec5a6910-d83c-4e13-aaf0-318ebf5d359e"  # lucadan777@gmail.com, super_admin
TEST_AFFILIATE_ID = "57e5841c-ff7d-479c-9208-b29c38dbafbb"  # AFF-TEST-001
TEST_AFFILIATE_CODE = "AFF-TEST-001"

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print(f"  FAIL: {msg}")


def ok(msg):
    print(f"  ok: {msg}")


def db_password():
    pw = os.environ.get("AFFILAYER_SUPABASE_DB_PASSWORD")
    if pw:
        return pw
    path = os.path.expanduser("~/.affilayer-secrets")
    with open(path) as f:
        for line in f:
            m = re.match(r"AFFILAYER_SUPABASE_DB_PASSWORD=(.*)", line.strip())
            if m:
                return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("no DB password: set AFFILAYER_SUPABASE_DB_PASSWORD or ~/.affilayer-secrets")


PW = db_password()


def connect():
    return psycopg2.connect(host=HOST, port=PORT, dbname=DB, user=USER, password=PW)


def as_admin(cur):
    """Make auth.uid()/is_admin() see the super_admin in this transaction.

    Direct Postgres has no JWT; Supabase's auth.uid() reads the
    request.jwt.claims setting, so set it transaction-locally.
    NOTE: is_local=true dies at COMMIT — re-call before every admin-gated
    RPC on a long-lived connection.
    """
    claims = json.dumps({"sub": ADMIN_UID, "role": "authenticated"})
    cur.execute("SELECT set_config('request.jwt.claims', %s, true)", (claims,))


def parse_uuid_array(val):
    """psycopg2 returns a uuid[] column as the string '{uuid,uuid}'."""
    if val is None:
        return None
    if isinstance(val, (list, tuple)):
        return [str(v) for v in val]
    s = str(val).strip().strip("{}")
    return [p for p in s.split(",") if p] if s else []


# ---------------------------------------------------------------------------
# Concurrent worker + lock-wait sampler
# ---------------------------------------------------------------------------

def rpc_worker(idx, fn_sql, args, barrier, results):
    """One session: wait at the barrier, then run the RPC in one txn."""
    conn = connect()
    try:
        barrier.wait(timeout=30)
        t_start = time.monotonic()
        wall_start = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        cur = conn.cursor()
        try:
            as_admin(cur)
            cur.execute(fn_sql, args)
            val = cur.fetchone()[0]
            conn.commit()
            results[idx] = {"ok": True, "value": val, "t_start": t_start,
                            "t_end": time.monotonic(), "wall_start": wall_start}
        except Exception as e:
            conn.rollback()
            results[idx] = {"ok": False, "pgcode": getattr(e, "pgcode", None),
                            "error": str(e).strip().splitlines()[0] if str(e) else type(e).__name__,
                            "t_start": t_start, "t_end": time.monotonic(),
                            "wall_start": wall_start}
    finally:
        conn.close()


def lock_sampler(stop_event, hits, rpc_name):
    """Poll pg_stat_activity for sessions blocked on a lock inside the RPC.

    Corroboration only — the timing overlap in run_concurrent is the proof.
    Records any Lock wait (the pooler may surface the blocked session's
    query text differently, so match on the RPC name when present but keep
    every Lock wait during the window).
    """
    conn = connect()
    conn.autocommit = True
    cur = conn.cursor()
    polls = [0]
    while not stop_event.is_set():
        polls[0] += 1
        cur.execute(
            "SELECT pid, wait_event, left(query, 140) FROM pg_stat_activity "
            "WHERE state = 'active' AND wait_event_type = 'Lock'")
        for pid, event, query in cur.fetchall():
            hits.append({"at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                         "pid": pid, "wait_event": event, "query": query,
                         "rpc": rpc_name in (query or "")})
        time.sleep(0.02)
    conn.close()
    hits.append({"polls": polls[0]})


def run_concurrent(label, fn_sql, args_list, rpc_name):
    """Run two sessions against the barrier; return per-thread results."""
    print(f"-- {label}")
    barrier = threading.Barrier(2)
    results = [None, None]
    stop = threading.Event()
    hits = []
    sampler = threading.Thread(target=lock_sampler, args=(stop, hits, rpc_name), daemon=True)
    sampler.start()
    threads = [threading.Thread(target=rpc_worker, args=(i, fn_sql, args_list[i], barrier, results))
               for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    stop.set()
    sampler.join(timeout=5)
    for i, r in enumerate(results):
        dur_ms = (r["t_end"] - r["t_start"]) * 1000
        if r["ok"]:
            print(f"   session {i}: OK {r['value']!r} in {dur_ms:.1f}ms (started {r['wall_start']})")
        else:
            print(f"   session {i}: FAIL pgcode={r['pgcode']} {r['error']} in {dur_ms:.1f}ms (started {r['wall_start']})")
    # Overlap proof: the loser must still have been inside its call when the
    # winner committed (winner.t_end). Sequential calls cannot show this.
    winner = next((r for r in results if r["ok"]), None)
    loser = next((r for r in results if not r["ok"]), None)
    if winner and loser and loser["t_start"] < winner["t_end"] < loser["t_end"]:
        ok(f"genuine overlap: loser was in-flight while winner committed "
           f"(loser start {loser['t_start']:.3f} < winner end {winner['t_end']:.3f} < loser end {loser['t_end']:.3f})")
    else:
        fail("no overlap proven: loser call did not span the winner's commit")
    if hits:
        polls = next((h.get("polls") for h in hits if "polls" in h), "?")
        waits = [h for h in hits if "wait_event" in h]
        rpc_waits = [h for h in waits if h.get("rpc")]
        if rpc_waits:
            ok(f"lock-wait sampler saw {len(rpc_waits)} blocked session(s) on {rpc_name} ({polls} polls): {rpc_waits[0]['wait_event']}")
        elif waits:
            print(f"   note: sampler saw {len(waits)} Lock wait(s) but none with the RPC in the query text ({polls} polls); timing overlap above is the proof")
        else:
            print(f"   note: lock-wait sampler saw no Lock wait in {polls} polls (20ms interval may have missed a short block); timing overlap above is the proof")
    else:
        print("   note: lock-wait sampler recorded nothing; timing overlap above is the proof")
    print(f"   starts {abs(results[0]['t_start'] - results[1]['t_start']) * 1000:.1f}ms apart")
    return results


# ---------------------------------------------------------------------------
# Fixture + verification helpers (single admin session)
# ---------------------------------------------------------------------------

def admin_conn():
    conn = connect()
    cur = conn.cursor()
    as_admin(cur)
    return conn, cur


def check_019_live(cur):
    for fn in ("approve_payout_request", "complete_payout_request"):
        cur.execute("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = %s", (fn,))
        (defn,) = cur.fetchone()
        assert "reserved_ledger_row_ids" in defn, f"019 not live: {fn} has no reserved_ledger_row_ids"
        assert "FOR UPDATE" in defn, f"019 not live: {fn} has no FOR UPDATE"
    ok("migration 019 live in both payout RPCs (FOR UPDATE + reserved_ledger_row_ids)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", "--no-cleanup", dest="keep", action="store_true",
                    help="leave the losing pending request instead of rejecting+deleting it")
    args = ap.parse_args()
    run_tag = "ITEM-1.7-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    print(f"item 1.7 payout reservation race test — run {run_tag}")
    print(f"affiliate {TEST_AFFILIATE_CODE} ({TEST_AFFILIATE_ID}), all fixture rows $0.01 USD")

    conn, cur = admin_conn()

    # 0. Preconditions: 019 live, no contaminating fixture rows.
    check_019_live(cur)
    cur.execute("SELECT count(*) FROM commission_ledger WHERE affiliate_id = %s AND status IN ('approved','payable')",
                (TEST_AFFILIATE_ID,))
    (n,) = cur.fetchone()
    if n:
        print(f"ABORT: {n} pre-existing approved/payable ledger row(s) for {TEST_AFFILIATE_CODE} would contaminate the test")
        return 2
    cur.execute("SELECT count(*) FROM payout_requests WHERE affiliate_id = %s AND status IN ('pending','approved')",
                (TEST_AFFILIATE_ID,))
    (n,) = cur.fetchone()
    if n:
        print(f"ABORT: {n} pre-existing pending/approved payout request(s) for {TEST_AFFILIATE_CODE} would contaminate the test")
        return 2
    ok("no pre-existing approved/payable ledger rows or pending/approved requests for the test affiliate")

    # 1. Fixture A: one $0.01 approved ledger row + two $0.01 pending requests.
    cur.execute(
        "INSERT INTO commission_ledger (affiliate_id, amount, currency, status, note) "
        "VALUES (%s, 0.01, 'USD', 'approved', %s) RETURNING id",
        (TEST_AFFILIATE_ID, f"{run_tag} race-test ledger row L1"))
    (l1,) = cur.fetchone()
    reqs = []
    for name in ("R1", "R2"):
        cur.execute(
            "INSERT INTO payout_requests (affiliate_id, amount, currency, status, note) "
            "VALUES (%s, 0.01, 'USD', 'pending', %s) RETURNING id",
            (TEST_AFFILIATE_ID, f"{run_tag} race-test payout request {name}"))
        reqs.append(cur.fetchone()[0])
    r1, r2 = reqs
    conn.commit()
    print(f"fixture A: L1={l1} approved $0.01; R1={r1}, R2={r2} pending $0.01 each")

    # 2. Test A: concurrent approve of two different requests, one row.
    res = run_concurrent(
        "Test A — concurrent approve(R1) vs approve(R2), one $0.01 row",
        "SELECT public.approve_payout_request(%s, %s)",
        [(str(r1), ADMIN_UID), (str(r2), ADMIN_UID)],
        "approve_payout_request")
    wins = [r for r in res if r["ok"]]
    losses = [r for r in res if not r["ok"]]
    if len(wins) == 1 and wins[0]["value"] == "approved":
        ok("exactly one approval succeeded")
    else:
        fail(f"expected exactly one 'approved', got {[r.get('value') for r in wins]} + {[r.get('error') for r in losses]}")
    if len(losses) == 1 and losses[0]["pgcode"] == "23514" and "exceeds the affiliate approved balance" in losses[0]["error"]:
        ok("loser failed cleanly 400 check_violation (exceeds approved balance)")
    else:
        fail(f"loser outcome not the expected 400 exceeds-balance: {losses}")

    cur.execute("SELECT status FROM commission_ledger WHERE id = %s", (l1,))
    if cur.fetchone()[0] == "payable":
        ok("L1 flipped to payable exactly once (reserved, not double-reserved)")
    else:
        fail("L1 not payable after Test A")
    cur.execute("SELECT id, status, reserved_ledger_row_ids FROM payout_requests WHERE id IN (%s, %s)",
                (str(r1), str(r2)))
    rows = {str(r[0]): (r[1], parse_uuid_array(r[2])) for r in cur.fetchall()}
    approved = [k for k, (s, _) in rows.items() if s == "approved"]
    pending = [k for k, (s, _) in rows.items() if s == "pending"]
    if len(approved) == 1 and len(pending) == 1 and rows[approved[0]][1] == [str(l1)]:
        ok(f"exactly one request approved with reserved_ledger_row_ids=[L1]; other still pending: winner={approved[0][:8]}")
        winner_req = approved[0]
    else:
        fail(f"unexpected request states after Test A: {rows}")
        winner_req = None

    # 3. Fixture B: fresh $0.01 row + one $0.01 pending request.
    cur.execute(
        "INSERT INTO commission_ledger (affiliate_id, amount, currency, status, note) "
        "VALUES (%s, 0.01, 'USD', 'approved', %s) RETURNING id",
        (TEST_AFFILIATE_ID, f"{run_tag} race-test ledger row L2"))
    (l2,) = cur.fetchone()
    cur.execute(
        "INSERT INTO payout_requests (affiliate_id, amount, currency, status, note) "
        "VALUES (%s, 0.01, 'USD', 'pending', %s) RETURNING id",
        (TEST_AFFILIATE_ID, f"{run_tag} race-test payout request R3"))
    (r3,) = cur.fetchone()
    conn.commit()
    print(f"fixture B: L2={l2} approved $0.01; R3={r3} pending $0.01")

    # 4. Test B: concurrent approve of the SAME request twice.
    res = run_concurrent(
        "Test B — concurrent approve(R3) vs approve(R3)",
        "SELECT public.approve_payout_request(%s, %s)",
        [(str(r3), ADMIN_UID), (str(r3), ADMIN_UID)],
        "approve_payout_request")
    wins = [r for r in res if r["ok"]]
    losses = [r for r in res if not r["ok"]]
    if len(wins) == 1 and wins[0]["value"] == "approved":
        ok("exactly one approval of R3 succeeded")
    else:
        fail(f"expected exactly one 'approved' for R3, got {wins} / {losses}")
    if len(losses) == 1 and losses[0]["pgcode"] == "23514" and "cannot be approved from status approved" in losses[0]["error"]:
        ok("loser failed cleanly 400 check_violation (cannot approve from approved)")
    else:
        fail(f"loser outcome not the expected 400 already-approved: {losses}")
    cur.execute("SELECT status, reserved_ledger_row_ids FROM payout_requests WHERE id = %s", (str(r3),))
    st, reserved = cur.fetchone()
    if st == "approved" and parse_uuid_array(reserved) == [str(l2)]:
        ok("R3 approved with reserved_ledger_row_ids=[L2]")
    else:
        fail(f"R3 state wrong: status={st} reserved={reserved}")
    cur.execute("SELECT status FROM commission_ledger WHERE id = %s", (l2,))
    if cur.fetchone()[0] == "payable":
        ok("L2 flipped to payable exactly once")
    else:
        fail("L2 not payable after Test B")

    # 5. Test C: concurrent complete of the SAME approved request twice.
    res = run_concurrent(
        "Test C — concurrent complete(R3) vs complete(R3)",
        "SELECT public.complete_payout_request(%s, %s, NULL, %s)",
        [(str(r3), ADMIN_UID, f"{run_tag}-txn"), (str(r3), ADMIN_UID, f"{run_tag}-txn")],
        "complete_payout_request")
    wins = [r for r in res if r["ok"]]
    losses = [r for r in res if not r["ok"]]
    if len(wins) == 1 and wins[0]["value"] == "paid":
        ok("exactly one completion of R3 succeeded")
    else:
        fail(f"expected exactly one 'paid' for R3, got {wins} / {losses}")
    if len(losses) == 1 and losses[0]["pgcode"] == "23514" and "cannot be completed from status paid" in losses[0]["error"]:
        ok("loser failed cleanly 400 check_violation (cannot complete from paid)")
    else:
        fail(f"loser outcome not the expected 400 already-paid: {losses}")
    cur.execute("SELECT count(*), coalesce(sum(amount),0) FROM payout_transactions WHERE payout_request_id = %s",
                (str(r3),))
    (txn_n, txn_sum) = cur.fetchone()
    if txn_n == 1 and float(txn_sum) == 0.01:
        ok("exactly ONE payout_transactions row for R3 ($0.01) — no double payment")
    else:
        fail(f"payout_transactions for R3: count={txn_n} sum={txn_sum}")
    cur.execute("SELECT status FROM commission_ledger WHERE id = %s", (l2,))
    if cur.fetchone()[0] == "paid":
        ok("L2 flipped to paid exactly once")
    else:
        fail("L2 not paid after Test C")
    cur.execute("SELECT status FROM payout_requests WHERE id = %s", (str(r3),))
    if cur.fetchone()[0] == "paid":
        ok("R3 in exactly one terminal state: paid")
    else:
        fail("R3 not paid after Test C")

    # 6. Global double-reservation / double-pay check.
    cur.execute(
        "SELECT id, reserved_ledger_row_ids FROM payout_requests "
        "WHERE affiliate_id = %s AND status IN ('approved','paid') AND reserved_ledger_row_ids IS NOT NULL",
        (TEST_AFFILIATE_ID,))
    seen = {}
    dup = False
    for rid, ids in cur.fetchall():
        for lid in parse_uuid_array(ids) or []:
            if lid in seen:
                dup = True
                fail(f"ledger row {lid} reserved by two requests: {seen[lid]} and {rid}")
            seen[lid] = rid
    if not dup:
        ok(f"no ledger row reserved by more than one request ({len(seen)} reserved row(s) total)")
    cur.execute("SELECT count(*) FROM payout_transactions pt JOIN payout_requests pr ON pr.id = pt.payout_request_id "
                "WHERE pr.affiliate_id = %s AND pr.note LIKE %s", (TEST_AFFILIATE_ID, run_tag + "%"))
    print(f"   test-run payout_transactions rows: {cur.fetchone()[0]} (R3: 1)")

    # 7. Cleanup: settle the Test A winner single-threaded (backs L1 with a
    # txn; provider NULL, no external money movement), reject+delete the
    # Test A loser (never reserved anything). Paid requests/txns/ledger
    # rows stay — deleting them would orphan paid ledger rows.
    if winner_req:
        as_admin(cur)  # claims are transaction-local; the earlier COMMIT cleared them
        cur.execute("SELECT public.complete_payout_request(%s, %s, NULL, %s)",
                    (winner_req, ADMIN_UID, f"{run_tag}-txn"))
        print(f"cleanup: completed Test A winner {winner_req[:8]} -> {cur.fetchone()[0]} (L1 paid, backed by txn)")
    loser_req = str(r2) if winner_req == str(r1) else str(r1)
    if not args.keep:
        as_admin(cur)
        cur.execute("SELECT public.reject_payout_request(%s, %s, %s)",
                    (loser_req, ADMIN_UID, f"{run_tag} race-test loser, never reserved"))
        print(f"cleanup: rejected Test A loser {loser_req[:8]} -> {cur.fetchone()[0]}")
        cur.execute("DELETE FROM payout_requests WHERE id = %s", (loser_req,))
        print(f"cleanup: deleted loser request row ({cur.rowcount} row)")
    else:
        print(f"cleanup skipped (--keep): loser request {loser_req} left pending")
    conn.commit()

    print("--- residue left behind (undeletable by design) ---")
    cur.execute("SELECT id, status, amount FROM commission_ledger WHERE note LIKE %s ORDER BY created_at",
                (run_tag + "%",))
    for lid, st, amt in cur.fetchall():
        print(f"   ledger {lid} status={st} amount=${amt} (note {run_tag})")
    cur.execute("SELECT id, status, amount FROM payout_requests WHERE note LIKE %s ORDER BY created_at",
                (run_tag + "%",))
    for rid, st, amt in cur.fetchall():
        print(f"   payout_request {rid} status={st} amount=${amt}")
    cur.execute("SELECT id, payout_request_id, amount, status FROM payout_transactions "
                "WHERE transaction_ref LIKE %s ORDER BY created_at", (run_tag + "%",))
    for tid, prid, amt, st in cur.fetchall():
        print(f"   payout_transaction {tid} request={str(prid)[:8]} amount=${amt} status={st}")
    conn.close()

    print("--- verdict ---")
    if FAILURES:
        print(f"FAILED ({len(FAILURES)} failure(s))")
        return 1
    print("PASS: all three concurrent races resolved to exactly one winner, "
          "losers failed cleanly 400, no double reservation, no double flip, no double payment")
    return 0


if __name__ == "__main__":
    sys.exit(main())

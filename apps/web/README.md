# @affilayer/web

AffiLayer web frontend — public site, auth, and the role-based app
(affiliate / advertiser / admin). Vite + React + TypeScript + Tailwind CSS v4
+ react-router-dom + @supabase/supabase-js. Charts are small custom SVG
components in `src/components/charts.tsx` (no chart library).

## Run

```bash
npm install
npm run dev      # vite dev server on http://localhost:5173
npm run build    # tsc --noEmit && vite build
npm run preview  # serve the production build
```

Requires Node >= 20.

## Env

Copy `.env.example` to `.env`:

| Var | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (optional) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key (optional) |
| `VITE_TRACKING_URL` | Tracking service base URL, default `http://localhost:3001` |

**Demo mode:** when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is
missing, the app runs on clearly-labeled fake demo data
(`src/lib/demo-data.ts`) and every app page shows a
"Demo data — not real" banner. The login page offers a demo role-picker
(affiliate / advertiser / admin / pending applicant) with no password.

**Supabase mode:** when both vars are set, auth uses Supabase
email/password and the data layer queries the tables named in
`CONTRACT.md` (`offers`, `campaigns`, `clicks`, `conversions`, `profiles`,
`payout_requests`, `support_tickets`). Only the anon key is ever used in
the browser — **never put a service-role key here**. Financial/tracking
writes are service-role only and are not done from this code.

## Routes

- Public: `/`, `/about`, `/advertisers`, `/affiliates`, `/how-it-works`,
  `/contact`, `/terms`, `/privacy`
- Auth: `/login`, `/register`, `/onboarding`, `/pending`
- Affiliate: `/app/affiliate/*` — dashboard, offers, offer detail + apply,
  my-campaigns, tracking-links, reports, postbacks, earnings, payouts,
  profile, tickets
- Advertiser: `/app/advertiser/*` — dashboard, campaigns, create-offer,
  affiliates, conversions, reports, billing
- Admin: `/app/admin/*` — overview, users, affiliates, advertisers, offers,
  campaigns, conversions, fraud, ledger, payouts, compliance, audit-logs,
  settings, tickets

Routes are role-guarded in `src/App.tsx` from the auth context
(`src/lib/auth.tsx`); pending accounts are redirected to `/pending`.

## Notes

- Shared types are mirrored locally in `src/lib/types.ts` (see `CONTRACT.md`);
  `package.json` also declares the `@affilayer/shared` workspace dependency.
- Tracking links are built as `{VITE_TRACKING_URL}/c/{affiliate_code}/{offer_id}?sub1=…&sub2=…`
  in `src/lib/types.ts` (`trackingLink`).
- No fake real-world statistics and none of the prohibited marketing claims
  named in `CONTRACT.md` appear anywhere in the copy.

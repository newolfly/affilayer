// FAQ content shared by the FAQ page and the SEO/JSON-LD module.
export const FAQ_GROUPS: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: 'General',
    items: [
      {
        q: 'What is AffiLayer?',
        a: 'AffiLayer is a CPA affiliate network. Advertisers publish offers with a defined payout and conversion action; affiliates promote those offers and earn commission on attributed conversions. We also provide SmartLink, a single link that routes each visitor to an eligible offer for their country and device.',
      },
      {
        q: 'Which verticals do you work with?',
        a: 'Our catalogue covers Dating, Finance, Gaming, Sweepstakes, Nutra and iGaming. The exact offers available depend on the advertisers currently on the network — the marketplace in your dashboard always shows the live list.',
      },
      {
        q: 'What is SmartLink?',
        a: 'SmartLink is one tracking link for all of your traffic. Each visitor is routed to an eligible offer based on their country and device, using clear deterministic rules. It does not use AI optimisation and it does not guarantee earnings — it simply matches traffic to offers it is allowed to run.',
      },
      {
        q: 'How do I get access to offers?',
        a: 'Create an account, complete onboarding, and wait for approval. Once approved, you can browse the marketplace. Some offers are open; others require you to apply, and the advertiser approves you before you can generate a tracking link.',
      },
    ],
  },
  {
    group: 'About your account',
    items: [
      {
        q: 'How do I register?',
        a: 'Use the registration form and choose whether you are joining as an affiliate or an advertiser, then complete onboarding with your profile, traffic source, vertical, GEO and payment details.',
      },
      {
        q: 'How long does approval take?',
        a: 'Applications are reviewed by our team. You can check your status on the approval page at any time.',
      },
      {
        q: 'Why was my application declined?',
        a: 'Common reasons are an incomplete profile, a traffic source we cannot verify, or a mismatch with the verticals and GEOs we currently serve. The decision message on your approval page says what to fix, and you can re-apply after updating your profile.',
      },
      {
        q: 'When do my statistics and payments appear?',
        a: 'Clicks appear in your reports as they are recorded. Conversions appear as pending once attributed, and move to approved, rejected or reversed after review. Earnings become payable only from approved conversions in the commission ledger.',
      },
      {
        q: 'How does SmartLink pay out?',
        a: 'SmartLink pays exactly like the offer the visitor was routed to — same payout model, same amount, same review process. There is no separate SmartLink rate.',
      },
      {
        q: 'Are there bonuses or a referral program?',
        a: 'Not yet. We do not run a bonus or referral program at launch. If one is introduced, the terms will be published here first.',
      },
    ],
  },
  {
    group: 'Finance',
    items: [
      {
        q: 'How and when do I get paid?',
        a: 'Payouts are manual and admin-approved. The default schedule is Net30: approved commissions become payable 30 days after the end of the month in which they were approved. You request a payout from your dashboard when your balance is payable, and our team processes it after review.',
      },
      {
        q: 'Which payout methods are available?',
        a: 'The payout methods available to your account are shown in your dashboard payment profile. We do not publish a fixed list here because methods depend on your country and account setup.',
      },
      {
        q: 'Is there a minimum payout?',
        a: 'Minimum payout thresholds are set in your account settings and shown on the payouts page before you request a payout. Balances below the threshold stay in your account until they reach it.',
      },
    ],
  },
  {
    group: 'Traffic rules',
    items: [
      {
        q: 'What traffic is not allowed?',
        a: 'Fraudulent traffic of any kind is prohibited: bots, misleading creatives, forced clicks, and incentivised traffic that misrepresents the offer. Each offer also lists its own allowed traffic sources, countries and devices — those rules apply on top of the network rules.',
      },
      {
        q: 'Can I use chat or incentivised traffic?',
        a: 'No. Chat traffic and incentivised traffic are not accepted on AffiLayer, and conversions from them will be rejected on review.',
      },
      {
        q: 'Are some traffic types restricted per advertiser?',
        a: 'Yes. Advertisers can restrict traffic sources, GEOs and devices per offer. Check the offer details before you promote it — running a restricted source is grounds for conversion rejection.',
      },
    ],
  },
]

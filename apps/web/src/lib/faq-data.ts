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
    group: 'Payout models',
    items: [
      {
        q: 'What is CPA?',
        a: 'CPA (cost per action) means the advertiser pays when a defined action happens — a signup, a registration, an install. The advertiser defines the action; on AffiLayer the conversion is recorded as pending, reviewed, and paid only if approved.',
      },
      {
        q: 'What is CPL?',
        a: 'CPL (cost per lead) means the advertiser pays for a lead — usually a form submission with contact details. The lead still has to be valid; junk leads are rejected on review.',
      },
      {
        q: 'What is CPS?',
        a: 'CPS (cost per sale) means the advertiser pays when a sale completes, usually as a percentage of the sale value. The affiliate bears the most risk here, because a click that does not buy pays nothing.',
      },
      {
        q: 'What is CPC?',
        a: 'CPC (cost per click) means the advertiser pays for the click itself. The advertiser bears the risk, because clicks do not guarantee any action.',
      },
      {
        q: 'What is the difference between CPA, CPL and CPS?',
        a: 'The trigger: CPA pays on a defined action, CPL pays on a lead, CPS pays only on a completed sale. The further the trigger is from the click, the more risk sits with the affiliate. On AffiLayer every model follows the same review and the same Net30 schedule after the trigger — the model changes what triggers payment, not when it becomes payable.',
      },
    ],
  },
  {
    group: 'Getting started',
    items: [
      {
        q: 'Do I need a website to promote offers?',
        a: 'No. Affiliates promote offers through the audiences they can reach — a website, a mailing list, paid traffic, or a community. What matters is that your traffic source can be verified during application review, and that it is allowed by the offer.',
      },
      {
        q: 'What traffic sources can I use?',
        a: 'Any source the offer allows and the network rules permit. Fraudulent traffic, bots, misleading creatives, forced clicks, incentivised traffic and chat traffic are banned network-wide. Each offer also lists its own allowed sources — check the offer details before you promote it.',
      },
      {
        q: 'How do I get my first tracking link?',
        a: 'Create an account, complete onboarding, and wait for approval. Once approved, browse the marketplace, apply to an offer where approval is required, and generate a tracking link — or use your SmartLink for mixed traffic. The link carries a unique click ID and up to five sub-parameters.',
      },
    ],
  },
  {
    group: 'Finance',
    items: [
      {
        q: 'How and when do I get paid?',
        a: 'Payouts are manual and admin-approved. The default schedule is Net30: approved commissions become payable 30 days after the end of the month in which they were approved. Worked example: a commission approved in November becomes payable 30 days after 30 November. You request a payout from your dashboard when your balance is payable, and our team processes it after review.',
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

/** Per-page FAQs, shown visibly on the page and mirrored 1:1 in that
 *  page's FAQPage JSON-LD (seo.ts). English-only for now: the sections
 *  render only when the page locale is English. */
export const PAGE_FAQS: Record<'advertisers' | 'affiliates' | 'how', { q: string; a: string }[]> = {
  advertisers: [
    { q: 'How do I publish an offer?', a: 'Create an advertiser account, complete onboarding, and publish from your dashboard: payout model and conversion action, caps, allowed countries and devices, and traffic rules. Offers go live once published.' },
    { q: 'How do I approve affiliates?', a: 'Affiliates apply to your offer where approval is required. You review each application — profile, traffic source, vertical and GEO — and approve or decline it before they can generate a tracking link.' },
    { q: 'What caps can I set?', a: 'A daily cap and a total cap per offer. The daily cap resets each day; the total cap stops the offer when reached. Clicks past a cap are refused rather than sent somewhere they cannot convert.' },
    { q: 'How do I pay?', a: 'You fund your account first, then pay only for conversions you have reviewed and approved. Approved commissions enter the ledger and become payable Net30 by default; payouts to affiliates are manual and admin-approved.' },
    { q: 'What traffic can I block?', a: 'Any source, GEO or device, per offer. Fraudulent traffic, bots, misleading creatives, forced clicks, incentivised traffic and chat traffic are already banned network-wide.' },
  ],
  affiliates: [
    { q: 'How do I get a tracking link?', a: 'Create an account, complete onboarding, and wait for approval. Once approved, browse the marketplace, apply to an offer where required, and generate a tracking link — or use your SmartLink for mixed traffic.' },
    { q: 'What are sub-parameters (sub1–sub5)?', a: 'Five labels you attach to your own clicks — campaign, placement, creative, audience, or anything you want to test. They travel with the click ID to the conversion, so you can see which clicks earned.' },
    { q: 'Direct offer or SmartLink — which first?', a: 'A direct link when you know the offer and the audience match. A SmartLink when your traffic is mixed — several countries or devices — and no single offer fits everyone.' },
    { q: 'When do I see my stats?', a: 'Clicks appear in your reports as they are recorded. Conversions appear as pending once attributed, and move to approved, rejected or reversed after review. Earnings become payable only from approved conversions in the commission ledger.' },
  ],
  how: [
    { q: 'How long is each step?', a: 'Steps 1, 3, 4 and 5 happen as you use the network — registration, publishing or promoting, clicks, and attribution. Step 2 (approval) and step 6 (review and payout) are done by our team by hand, so no fixed time is promised; you can check your status on the approval page.' },
    { q: 'What happens if my application is declined?', a: 'The decision message on your approval page says what to fix — usually an incomplete profile, a traffic source we cannot verify, or a mismatch with the verticals and GEOs we serve. Update your profile and re-apply.' },
    { q: 'When does a conversion become payable?', a: 'A conversion is recorded as pending, reviewed, and — if approved — entered in the commission ledger. Approved commissions become payable 30 days after the end of the month in which they were approved (Net30 by default).' },
  ],
}

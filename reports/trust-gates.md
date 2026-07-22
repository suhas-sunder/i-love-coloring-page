# Trust, legal, owner, and advertising gates

The public operator-display and mailing-address decisions are recorded. The 7 gates below remain unresolved and cannot be truthfully closed from repository evidence alone.

## owner.governing_law

- Current failure: Select governing-law language with qualified review before adding it to the Terms.
- Configuration: app/terms/page.tsx; src/config/siteIdentity.ts
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: Qualified selection and approval of any governing-law language.
- Risk of guessing: Could create an unsupported legal clause or jurisdiction.
- Production consequence: Final Terms approval remains blocked.
- AdSense consequence: Trust-page legal review remains incomplete.

## legal.audience_treatment

- Current failure: Decide child-directed, mixed-audience, or general-audience treatment, including explicitly child-oriented collections.
- Configuration: site-wide audience treatment; /coloring-pages/for-kids
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: Reviewed child-directed, mixed-audience, or general-audience treatment and implementation requirements.
- Risk of guessing: Could incorrectly characterize a mixed library or child-directed treatment.
- Production consequence: Audience-dependent privacy and advertising configuration remains blocked.
- AdSense consequence: Age treatment and ad-serving choices cannot be configured safely.

## legal.policy_approval

- Current failure: Complete qualified review of the Privacy Policy, Terms, artwork-rights position, and final public-use policy.
- Configuration: /privacy, /terms, /contact, /affiliate-disclosure
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: Owner and qualified review of privacy, terms, use policy, and rights-removal wording.
- Risk of guessing: Could publish permissions, rights, or compliance claims the operator has not approved.
- Production consequence: Trust pages remain factual drafts and deployment verification stays blocked.
- AdSense consequence: Policy review is incomplete before an advertising application.

## legal.trademark_policy

- Current failure: Complete qualified review of the approved case-by-case policy for brand and trademark references.
- Configuration: printable titles and editorial policy
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: A reviewed policy for public brand and trademark references.
- Risk of guessing: Could misstate rights or acceptable treatment of brand references.
- Production consequence: Title-review policy remains incomplete.
- AdSense consequence: Rights and content-policy review remains incomplete.

## ads.account_configuration

- Current failure: Verify account status, site verification, ads.txt, placement, and Auto Ads decisions in the authenticated provider interface.
- Configuration: advertisement mode, publisher configuration, and ads.txt
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: no
- Input required: Verified publisher ID, verification method, slot plan, Auto Ads decision, and account-supplied ads.txt line.
- Risk of guessing: Could activate the wrong account, invalid slots, or an unverified ads.txt declaration.
- Production consequence: LIVE mode remains unavailable; OFF remains the production default.
- AdSense consequence: Account verification and serving cannot begin.

## ads.consent_and_age_configuration

- Current failure: Choose ad personalization, regional consent, CMP, and age-treatment configuration before live advertising.
- Configuration: advertising consent, personalization, CMP, and age-treatment configuration
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: Approved regional consent, personalization, CMP, and age-treatment decisions.
- Risk of guessing: Could process advertising data under an incorrect consent or age-treatment mode.
- Production consequence: LIVE advertising remains blocked.
- AdSense consequence: Consent and serving configuration remains incomplete.

## external.production_validation

- Current failure: Confirm the Netlify production and rollback workflow, then validate the deployed revision, Search Console state, and any later account behavior externally.
- Configuration: deployed production site and advertising account
- Code-fixable now: no
- Owner facts required: no
- Legal review required: no
- Input required: Approved deployment and external account access for final verification.
- Risk of guessing: Local output cannot prove external account state, creatives, consent, or production requests.
- Production consequence: Final deployment verification must occur in the later production task.
- AdSense consequence: AdSense review and real-serving behavior remain externally unverified.

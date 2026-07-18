# Trust, legal, owner, and advertising gates

Nine external/owner/legal gates were present before this task and remain explicit after code-level disclosure fixes. None can be truthfully closed from repository evidence alone.

## owner.operator_identity

- Current failure: Confirm the public operator name and whether a business or legal entity should be identified.
- Configuration: src/config/siteIdentity.ts; About, Privacy, and Terms
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: Verified public operator name and whether a business/legal entity should be identified.
- Risk of guessing: Would publish an unverified person, business, or legal entity.
- Production consequence: Production-readiness verification remains blocked.
- AdSense consequence: Publisher identity and trust review remain incomplete.

## owner.mailing_address

- Current failure: Decide whether a public mailing address is required or desired and provide only a verified address.
- Configuration: src/config/siteIdentity.ts; Privacy and Terms
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: A decision on whether an address is required and, only if approved, a verified public address.
- Risk of guessing: Would expose a false or private address.
- Production consequence: Production-readiness verification remains blocked pending the decision.
- AdSense consequence: Account and policy identity review remains incomplete.

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

- Current failure: Review and approve the Privacy Policy, Terms, permitted-use rules, and rights-removal wording.
- Configuration: /privacy, /terms, /contact, /affiliate-disclosure
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: Owner and qualified review of privacy, terms, use policy, and rights-removal wording.
- Risk of guessing: Could publish permissions, rights, or compliance claims the operator has not approved.
- Production consequence: Trust pages remain factual drafts and deployment verification stays blocked.
- AdSense consequence: Policy review is incomplete before an advertising application.

## legal.trademark_policy

- Current failure: Choose a policy for brand and trademark references in public titles.
- Configuration: printable titles and editorial policy
- Code-fixable now: no
- Owner facts required: yes
- Legal review required: yes
- Input required: A reviewed policy for public brand and trademark references.
- Risk of guessing: Could misstate rights or acceptable treatment of brand references.
- Production consequence: Title-review policy remains incomplete.
- AdSense consequence: Rights and content-policy review remains incomplete.

## ads.account_configuration

- Current failure: Supply verified account credentials, verification method, ads.txt line, ad-unit plan, and Auto Ads decision in a separate approved round.
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

- Current failure: Validate account review, real creatives, production consent, production requests, and production asset-origin behavior externally.
- Configuration: deployed production site and advertising account
- Code-fixable now: no
- Owner facts required: no
- Legal review required: no
- Input required: Approved deployment and external account access for final verification.
- Risk of guessing: Local output cannot prove external account state, creatives, consent, or production requests.
- Production consequence: Final deployment verification must occur in the later production task.
- AdSense consequence: AdSense review and real-serving behavior remain externally unverified.

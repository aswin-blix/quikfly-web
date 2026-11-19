# Privacy (DPDP)

How QuikFly meets India's **Digital Personal Data Protection Act, 2023** and the **DPDP Rules, 2025** (notified 14 Nov 2025; most duties apply from about **May 2027**), where each piece lives, and what to do if data leaks.

This is an engineering summary, not legal advice. Have a lawyer review the notice text and this plan before launch.

## What's built

| Duty under the Act and Rules | How QuikFly meets it | Where |
|---|---|---|
| Notice before consent, in plain language: what data is collected, why, how to withdraw consent, how to complain | The privacy notice. One text for the website and both apps, with a short summary for the consent sheet | `packages/shared/src/privacy.ts` → `GET /v1/privacy`; website `/privacy`; apps `/privacy` |
| Consent is a clear yes, with proof kept | After sign-in, anyone who hasn't agreed to the **current** version sees "Your privacy": *I agree, continue* or *Don't agree, sign me out*. Each consent is stored with its version and time; earlier ones are kept | `POST /v1/me/consent`; `users.privacy_version`, `privacy_consents`; web `PrivacyConsent.tsx`, app `PrivacyGate` |
| Ask again when the notice changes | Bump `PRIVACY_NOTICE.version`. Everyone is asked again on their next visit | `packages/shared/src/privacy.ts` |
| Right of access | Account → Privacy & data → **Download (JSON)**: every table that holds the person's data, without login secrets or storage keys | `GET /v1/me/export` (`services/privacy.ts`) |
| Right to correct | Profile, travellers, places and contacts are all editable | Account sections |
| Right to erase and withdraw consent | Delete account (OTP) closes it at once and erases it after 30 days (`DELETION_GRACE_DAYS`); signing in before then restores it | `POST /v1/me/delete`; cron `privacySweep` |
| Erase when no longer needed, with **48 hours' notice** | Accounts unused for `inactivityEraseDays` (default 1095, i.e. 3 years) get a notice and are closed; they are erased **30 days later** unless the person signs in. Skipped: wallet money, a confirmed booking, a partner application past draft | Cron `privacySweep`; Settings → Privacy (DPDP) |
| What erasure keeps | Bookings, invoices, wallet history and partner earnings stay for tax and accounting law (up to 8 years), with the name, number, email, licence, GST details, ride PIN, bank details and document photos removed. Saved places, travellers, contacts, notifications, devices, share links and support tickets are deleted | `eraseAccounts()` in `services/privacy.ts` |
| Published contact for privacy questions (DPO or other person) and grievance redressal | The **Grievance Officer** on the notice and in Account → Privacy & data. Replies are due within 30 days | Settings `privacyOfficerName`, `privacyOfficerEmail`, `privacyOfficerPhone` |
| Children: verifiable parental consent | Accounts are for **18 and over** (`LIMITS.minAge`), so no parental-consent flow is needed. Children may still be travellers on an adult's booking | `packages/shared/src/rules.ts` |
| Breach notice to users and the Board | The response plan and templates below | This file |
| Reasonable security safeguards | Hashed session tokens, HTTPS only, private R2 bucket for documents, staff permissions and audit log | `apps/api/README.md` |

**Placeholders.** The Grievance Officer is "QuikFly Grievance Officer", privacy@quikfly.in, 044 4000 1234. Change them in admin → Settings → Privacy (DPDP); the defaults are in `DEFAULT_SETTINGS`. Nothing else holds a copy.

**Demo limits.** There is no SMS or email yet, so the inactivity notice is an in-app notification plus a push when Firebase is set up. Before launch, send it by SMS too.

## Changing the notice

1. Edit the text in `packages/shared/src/privacy.ts` (`privacyNotice()`).
2. If the meaning changed, set `PRIVACY_NOTICE.version` and `updated` to today's date.
3. Deploy the API and the website together. The apps read the notice from the API, so they need no release.

## If personal data leaks

The Rules require telling **every affected person without delay**, and the **Data Protection Board of India** without delay and in full **within 72 hours** of becoming aware of the breach.

1. **Contain it, the same hour.** Revoke leaked keys and secrets (`wrangler secret put …`). End sessions: staff in admin, customers with `DELETE FROM sessions`. Block the hole.
2. **Record it.** What happened and when, which data and whose, how it was found, and what was done. Keep this log for the Board.
3. **Work out who is affected.** Query D1 for their user ids and numbers.
4. **Tell them.** Use template A as an in-app notification of kind `privacy.breach` (one `INSERT … SELECT` over the affected ids). Add SMS or email once those exist.
5. **Tell the Board.** Send template B now. Send the full report within 72 hours.
6. **Afterwards.** Fix the cause, add a test, and write a dated entry in `docs/decisions.md`.

### Template A: notice to affected people

> **Title:** Important: your QuikFly data
>
> On {date} we found that {what happened, in one plain sentence}. This affected your {kinds of data, e.g. name and mobile number}. {Your payment details were not affected.}
>
> **What it means for you:** {the real risk, e.g. you may get calls pretending to be QuikFly}.
> **What we've done:** {e.g. closed the gap, signed everyone out}.
> **What you can do:** {e.g. never share an OTP; QuikFly will never ask for it}.
>
> Questions: {Grievance Officer name}, {email}, {phone}.

### Template B: intimation to the Data Protection Board

> **To:** Data Protection Board of India (through its digital office, as the Board directs)
> **From:** {company legal name}, {address}. Contact: {Grievance Officer name, email, phone}
>
> **Nature and extent of the breach:** {what happened, which systems}
> **Timing and location:** {when it happened, when we found it, where}
> **Likely impact:** {kinds of data, number of people affected}
> **Steps taken:** {containment so far}
> **People informed:** {when and how}
>
> A detailed report follows within 72 hours: facts, circumstances and reasons, measures taken, findings about the person responsible, remedial measures, and the report on notifying affected people.

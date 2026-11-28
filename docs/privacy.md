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
| Parcels: the receiver is someone else (third-party data) | Stored only to deliver. The receiver's account gets no access and no code (the demo login would expose both); the tracking page shows first names only. Staff with `parcels.manage` see both numbers in the queue; a counter login only for its operator's parcels to or from its city. The website holds a draft's receiver in this tab's session storage until booking or sign-out; the app holds it in memory only. The app's contact picker is Android's own: it hands over the one picked number, and the app has no contacts permission. Export: parcels sent (receiver's number masked) and received (sender's masked). The bookings export has a parcel's LR, mode, state and weight only. A Quick parcel's tracking page shows the city, never the pickup or drop. Erasing either side blanks the receiver's name, number and the contents | `parcels`, `services/parcels/`, `exportData()`, `eraseAccounts()` |
| Right to erase and withdraw consent | Delete account (OTP) closes it at once and erases it after 30 days (`DELETION_GRACE_DAYS`); signing in before then restores it | `POST /v1/me/delete`; cron `privacySweep` |
| Erase when no longer needed, with **48 hours' notice** | Accounts unused for `inactivityEraseDays` (default 1095, i.e. 3 years) get a notice and are closed; they are erased **30 days later** unless the person signs in. Skipped: wallet money, a confirmed booking, a parcel on its way, a partner application past draft | Cron `privacySweep`; Settings → Privacy (DPDP) |
| What erasure keeps | Bookings, invoices, wallet history and partner earnings stay for tax and accounting law (up to 8 years), with the name, number, email, licence, GST details, ride PIN, bank details, suspension reason and document photos removed. Saved places, travellers, contacts, notifications, devices, share links, support tickets, SOS alerts and staff notes on the person's bookings are deleted. Driver records lose the name, number, licence number, gender and the link to the account (an erased partner's whole fleet, and an erased person's own record on anyone's fleet); the last location is deleted | `eraseAccounts()` in `services/privacy.ts` |
| Notifications on phones and in browsers | A customer who turns notifications on registers a phone token or a browser push subscription (`push_devices`, exported with its platform and dates only, deleted on erasure and on sign-out). The notice names Firebase and the browser's push service as processors. Pushed text is the same as the inbox's: never a receiver's details or a collection code. Staff browsers register in `admin_push_devices` (staff data, no customer export) | `services/notifications.ts`, `services/admin/alerts.ts`, `scheduled.ts` |
| Staff access is limited and recorded | Staff see customer data only through the admin panel, by role (`PERMISSIONS`): the Customers screen needs `customers.view`, account actions `customers.manage`, SOS alerts `sos.manage`. Every action is in the audit log with the staff member and a written reason; internal booking notes are part of the person's export | `apps/admin`, `audit_log`, `packages/shared/src/admin.ts` |
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
4. The captains' notice works the same way: edit `captainNotice()`, and bump `CAPTAIN_NOTICE.version` (keep the `captain-` prefix) when its meaning changes; captains are asked again before their next time online.

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

## QuikFly Captain (drivers), from 2026-11-27

A captain's data is the driver record a partner registered (name, number, licence, gender as staff recorded it), linked to the captain's own account at sign-in, plus **where they last were while online** (`driver_state`: one row, the latest position only, no trail) and the rides they were offered (`ride_offers`). The captain's own export (`GET /me/export`) includes all three (`captain`, `captain_location`, `captain_offers`); erasure removes the personal parts as above. **Captains have their own notice** (owner's decision, 2026-11-28): `captainNotice()` in `packages/shared/src/privacy.ts`, served at `GET /v1/privacy/captain`, shown in QuikFly Captain and on the website's /privacy under "For drivers". It covers location while online, offers, trips, who sees what (the rider sees the captain's name, vehicle, number and position from acceptance to the drop) and how long it's kept. A captain agrees once before going online (`POST /v1/driver/notice`; until then `captainBlocker` refuses online), and again when `CAPTAIN_NOTICE.version` changes. The consent is a `privacy_consents` row with a `captain-…` version, so it's in the export and kept as proof. The main notice and its version are unchanged, so customers aren't asked again.

**Real location (step 7):** while a captain is online with GPS, QuikFly Captain sends their phone's position about every 5–15 seconds, also with the app closed (Android shows a notification the whole time; iOS shows its location indicator). The server keeps only the latest fix (`driver_state`: latitude, longitude and the matching city-map point), never a trail, and it stays in the captain's export. Before Android or iOS asks, the app explains this once (Play's prominent-disclosure rule). Going offline stops it. The captains' notice above describes it, and the app's own explanation comes before the system prompt.

**What a captain sees of a rider (step 2):** while a ride is offered, the route, fare and payment method only (never the rider's name, number or PIN). Once they accept: the rider's first name, and their mobile number until the trip starts (to find each other at the pickup), then no longer. A release reason the captain picks is kept with the offer for staff and is in the captain's export. **A rider's shared trip link** (step 4) shows the captain's position on the demo city map, from acceptance to the drop, to whoever has the link; never GPS coordinates, never the captain's number. **Staff** (`drivers.view`: owner, operations) see each captain's status, last seen time and latest map position on the Captains page, and a live ride's dispatch log; **the fleet owner** sees each of their drivers' status (online, on a ride) in QuikFly Partner, not their position.

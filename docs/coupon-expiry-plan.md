# Coupon expiry decisions

User-confirmed behavior, 2026-11-01 Asia/Taipei. Implementation accompanies the admin dashboard update. Live legacy-date backfill remains a manual administrator action.

- Legacy expiry dates can be supplied by the administrator. Preserve each coupon's original date; explicitly unlimited coupons stay unlimited. Missing dates do not establish unlimited validity.
- Support unlimited, fixed expiry date, and N days after issuance (issuance date is day one, valid through the end of local day N). Snapshot the resolved expiry on each issued coupon; template changes affect future issuance only.
- A fixed date includes that whole date in Asia/Taipei. Internally use the exclusive start of the next local day to avoid subsecond ambiguity.
- Acceptance of a purchase request, checked with server time, is the redemption deadline. Reserve the coupon atomically for that request, snapshot the discount and expiry, and prevent its use on another request.
- Later review, including review in another month, must preserve the validly reserved discount. Pending payment discrepancies keep the same request and reservation. Do not create a replacement request merely to correct payment information.
- Record submittedAt, actual received payment date/time, and reviewedAt separately. Revenue month follows actual receipt, not submission or review. Examples: October request + November receipt = November revenue; October receipt + November review = October revenue.
- A rejected or cancelled request releases the coupon, keeping its original expiry. If it has expired, retain an expired record and prevent use for new requests. Reissue/repair never restarts a legacy expiry or restores a consumed coupon.
- No automatic cancellation or payment time limit has been agreed; use pending reminders, not an invented time limit. A separate explicit policy would be needed before expiring reservations.
- Enforce expiry and reservation ownership server-side, not just in the UI. Owned-coupon purchases and reviews use server APIs. Other existing purchase paths remain separate; legacy unreserved coupon orders must still be valid at review.
- Existing legacy dates must be entered/confirmed by an administrator. No bulk entitlement or financial-history updates run during deployment. Legacy revenue without an actual-receipt field retains its previous date.

- Automatic birthday benefits also reserve the original birthday-month entitlement at application, preventing duplicate annual use. A release after month end never renews the birthday month.
- Existing pending owned-coupon/birthday requests have an explicit administrator-reviewed retention action requiring evidence, original timestamp, original expiry, unchanged package and matching pricing. It creates no points; subsequent approval still requires actual receipt confirmation.
- Income summary supports selecting a month; today totals remain tied to the actual current Taiwan date regardless of that selection.

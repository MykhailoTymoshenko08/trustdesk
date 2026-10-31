# Data model - payments

## payments
- `id`, `family_id`, `package_code`
- `amount_cents` - USD cents (4 lessons = 18000, 12 = 50400, 24 = 93600)
- `status` - `pending | succeeded | failed | refunded`
- `provider_intent_id` - unique, links to the payment provider
- `idempotency_key` - unique per checkout, protects from duplicate charges created by the client
- `created_at`, `succeeded_at` - UTC

## lesson_packages (prepaid lessons)
- `id`, `family_id`, `payment_id` (null for support grants)
- `credits_total`, `credits_used`
- `source` - `purchase | support_grant | promo`
- `expires_at` - purchase date + 6 months, UTC

## subscriptions
- `id`, `family_id`, `package_code`, `status` (`active | paused | cancelled`)
- `renews_at` - UTC date of the next charge; used by the impact calculator for "renewals at risk"

## events
- `payment.checkout`, `payment.succeeded`, `payment.failed`, `payment.refunded`
- Payload has `payment_id`, `amount_cents`, `provider_intent_id`; `error_code` is set on failures.

## Invariants
- `credits_used <= credits_total` for every package.
- Every package with `source = purchase` has exactly one `succeeded` payment.
- Money is stored in integer cents; no floats.
- A refunded payment has `credits_total - credits_used` removed from the balance.
- Duplicate-charge signature: two `succeeded` payments, same `family_id`, same `amount_cents`, minutes apart,
  different `idempotency_key`.

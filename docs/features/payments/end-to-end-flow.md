# End-to-end flow - payments

1. Parent opens "Buy lessons" and selects a package (4, 12 or 24 lessons).
2. The app calls `POST /payments/checkout` with `package_code` and an `idempotency_key` generated on the client.
3. Backend creates a `payments` row in status `pending` and a payment intent at the provider.
4. The parent confirms the card; the provider charges the card.
5. The provider sends the webhook `payment.succeeded` to `POST /webhooks/payments`.
6. Backend verifies the signature, finds the payment by intent id and sets status `succeeded`.
7. In the same transaction it creates the `lesson_packages` row with `credits_total` and `expires_at`.
8. The parent gets a receipt email and the new balance appears in the family app.
9. Each lesson uses one credit from the oldest package that is still valid (FIFO by expiry).
10. For subscriptions, a renewal job charges the saved card 3 days before the credits run out.

## Refund path
- Support opens a refund request; a human approves it in the console.
- Backend calls the provider, receives `charge.refunded`, marks the payment `refunded` and removes unused credits.

## Failure paths
- Card declined: `payment.failed`, the app shows the reason, no package is created.
- Webhook delayed: the package appears within a few minutes; the app shows "Payment is processing".
- Duplicate checkout with the same `idempotency_key` returns the original payment.

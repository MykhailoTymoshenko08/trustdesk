# Payments

Families pay for Lumo lessons by buying prepaid lesson packages.

## What it does
- Parent picks a package in the family app and pays by card (Stripe) or Apple/Google Pay.
- Packages are prepaid lessons: the family pays upfront and each completed or missed lesson uses one credit.
- Packages can be renewed manually or by subscription (auto-renewal when credits run out).

## Packages
- Starter: 4 lessons, $45 per lesson.
- Standard: 12 lessons, $42 per lesson.
- Intensive: 24 lessons, $39 per lesson.
- A package is valid for 6 months from purchase; unused credits expire after that.

## Rules
- One charge per checkout; the checkout carries an idempotency key to avoid duplicates.
- Credits are added only after the payment provider confirms the charge (webhook).
- Free lessons granted by support are added as credits with `source = support_grant`, no charge.
- Refunds cover unused credits only and always need human approval.

## Surfaces
- Family app: "Buy lessons" screen and billing history.
- Support console: payment lookup, credit grant, refund request.
- Provider webhooks: `payment.succeeded`, `payment.failed`, `charge.refunded`.

## Status
- Stable. Rare isolated double charges happen when a parent taps "Pay" twice on a slow connection
  (see `known-gotchas.md`).

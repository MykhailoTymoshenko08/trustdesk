# Business context - lesson reschedule

## Why it exists
- Kids' schedules change often (school events, illness, travel). Self-service reschedule keeps families
  from cancelling lessons or contacting support.
- Reschedule is one of the top 3 reasons to open the app, right after "join lesson" and "homework".

## Who cares
- Parents: want a quick, predictable change with a clear confirmation.
- Tutors: need notice and a free slot; a wrong time means an idle hour and lost pay.
- Support: reschedule questions are about 15% of tickets.

## Money impact
- Average lesson is worth about $45 (`lesson_value_cents` = 4500), taken from the prepaid package.
- A missed lesson is a lost lesson for the family; the usual remedy is one free lesson.
- Families who miss a lesson because of our error churn more: renewals within 14 days are at risk.

## Support policy
- Wrong time caused by our bug: apologise, give 1 free lesson, move the lesson to the right time.
- Wrong time caused by the user (picked the wrong slot): offer one free extra reschedule.
- A refund is never the first answer; refunds need human approval.

## SLA
- Confirmation message right after the change (push + email).
- Wrong-time tickets from a known incident: answer within 30 minutes, proactive message to silent families.

## Metrics
- Reschedules per lesson, reschedule-related tickets per 1000 lessons, no-show rate after reschedule.

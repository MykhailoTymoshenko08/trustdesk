# Lesson reschedule

Lets a parent move a booked Lumo lesson to another free slot of the same tutor.

## What it does
- Parent opens a lesson in the family app and picks a new slot from the tutor's free slots.
- Backend validates the slot, updates the lesson and notifies the tutor and the family.
- The old slot is released and becomes bookable again.

## Rules
- Allowed up to 4 hours before the lesson start; later changes go through support.
- Max 2 reschedules per lesson; the third one needs support approval.
- Same tutor only; changing the tutor is a separate flow ("change tutor").
- Only lessons in status `scheduled` can be moved.

## Time handling
- Lesson times are stored in UTC (`lessons.starts_at`).
- The UI shows them in the family timezone (`families.timezone`, IANA name, e.g. `Europe/Kyiv`).
- The client sends the new slot as local time plus tz name; the backend converts it to UTC exactly once.

## Surfaces
- Family web app and mobile app: "Move lesson" button on the lesson card.
- Support console: agents can reschedule on behalf of the family.

## Status
- Stable since v2.0.
- Release `v2.14` touched this feature (see `known-gotchas.md`): lessons moved after it can land 1 hour earlier (`ERR_TZ_SHIFT`).

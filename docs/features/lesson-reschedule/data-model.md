# Data model - lesson reschedule

## lessons
- `id`, `family_id`, `tutor_id`, `child_name`
- `starts_at` - UTC, ISO 8601, source of truth for the lesson time
- `duration_min` - 25 or 50
- `status` - `scheduled | completed | cancelled | missed`
- `reschedule_count` - integer, max 2 without support
- `package_id` - the prepaid package the lesson is taken from
- `lesson_value_cents` - 4500 by default

## families
- `id`, `name`, `email`
- `timezone` - IANA name (`Europe/Kyiv`, `Europe/Warsaw`, `America/New_York`); used only for display and input

## tutor_slots
- `tutor_id`, `starts_at` (UTC), `is_free`

## events (user action log)
- `id`, `user_id`, `at` (UTC), `feature`, `event`, `payload` (JSON), `error_code`, `release`
- `lesson.reschedule` payload: `lesson_id`, `old_start`, `new_start` (as requested), `stored_start` (as saved)
- Healthy event: `new_start == stored_start`. Bug signature: `stored_start` is 1 hour earlier and `error_code = ERR_TZ_SHIFT`.

## Invariants
- All timestamps in the database are UTC; local time exists only at the edges (input and rendering).
- A tutor slot is booked by at most one lesson (unique index on `tutor_id, starts_at`).
- `reschedule_count` increases by exactly 1 per successful reschedule.

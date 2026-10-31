# Known gotchas - lesson reschedule

## 1. Double timezone shift in v2.14 (open)
- Release `v2.14` moved the local-to-UTC conversion into `reschedule_lesson` but left the old conversion
  in the API layer, so the offset is applied twice.
- Symptom: the lesson lands 1 hour earlier than the parent picked (picked 18:00, lesson at 17:00).
- Log signature: event `lesson.reschedule` with `error_code = ERR_TZ_SHIFT`, `release = v2.14`.
- The family app shows the wrong time at once, so parents notice only when they open the card;
  many never write to support.
- Affected: families that rescheduled after the v2.14 rollout (about 47 families; only a part contact support).
- Mitigation: move the lesson to the intended time and send a short apology; fix is to convert once.

## 2. Daylight saving time
- Offsets change on the last Sunday of March and October in the EU. Always convert with the IANA name,
  never with a fixed number of hours.
- Reminders for a lesson near the switch day can look 1 hour off if the tz database on the worker is old.

## 3. Reminders vs. card
- Reminders read `starts_at` directly. If a reminder and the card disagree, check `starts_at` in UTC first.

## 4. Not a bug
- A tutor in another timezone sees a different local time for the same lesson. This is expected.
- Parents who travel keep the home timezone in their profile until they change it in settings.

## 5. Support tips
- Ask for the lesson id; compare `new_start` and `stored_start` in the `lesson.reschedule` event.
- Do not tell the family "check your phone clock" before looking at the event log.

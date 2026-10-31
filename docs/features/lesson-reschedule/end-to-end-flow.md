# End-to-end flow - lesson reschedule

1. Parent opens the lesson card in the family app and taps "Move lesson".
2. The app calls `GET /lessons/{id}/slots` and shows the tutor's free slots in the family timezone.
3. Time is stored in UTC and shown in family tz: the client sends the chosen slot as local time + tz name
   (e.g. `18:00 Europe/Kyiv`); the backend converts it to UTC once and never again.
4. The app calls `POST /lessons/{id}/reschedule` with `{ "new_start_local": "...", "tz": "..." }`.
5. Backend checks: lesson is `scheduled`, more than 4 hours to start, reschedule count < 2, slot still free.
6. In one transaction it frees the old slot, books the new one and sets `lessons.starts_at` (UTC).
7. It writes event `lesson.reschedule` with `old_start`, `new_start`, `stored_start` and `error_code` (null on success).
8. It queues notifications: push + email to the family, calendar update to the tutor.
9. The family app reloads the lesson and renders `starts_at` converted to the family timezone.
10. The reminder job (24h and 1h before start) reads `starts_at` in UTC and renders it per recipient timezone.

## Failure paths
- Slot taken meanwhile: 409 `SLOT_TAKEN`, the app shows the fresh slot list.
- Too late: 422 `RESCHEDULE_TOO_LATE`, the app suggests contacting support.
- Release `v2.14`: step 3 applied the timezone offset twice on one code path, so the stored time is 1 hour
  earlier than requested; the event carries `error_code = ERR_TZ_SHIFT`.

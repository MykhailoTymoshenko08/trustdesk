# End-to-end flow - homework

1. The lesson takes place; the tutor teaches and the lesson stays in status `scheduled` / `in_progress`.
2. After the lesson the tutor opens the console and taps "Complete lesson".
3. Homework is visible after the tutor completes the lesson: only `POST /lessons/{id}/complete` publishes it.
4. `complete_lesson` sets `lessons.status = completed` and saves the tutor's topic list and a short comment.
5. The homework generator builds a set of 5-10 tasks from the topics and creates a `homework_sets` row
   with `published_at = now`.
6. The child's app receives a push "New homework is ready"; the family dashboard shows the new set.
7. Before step 3 `GET /lessons/{id}/homework` returns `404 HOMEWORK_NOT_PUBLISHED` and the app shows the empty state.
8. The child solves tasks; each answer goes to `POST /homework/{id}/answers` and is auto-checked.
9. When all tasks are answered the set becomes `done`; the parent gets a result summary.
10. After 7 days an unfinished set becomes `expired` and is hidden from the child.

## Reminders
- 24 hours after publishing, an unfinished set triggers a push to the child and an email to the parent.

## Failure paths
- Tutor forgets to complete the lesson: a console banner after 15 minutes and an ops alert after 2 hours.
- Generator error: set stays unpublished, event `homework.generate_failed` is logged and retried 3 times.

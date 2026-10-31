# Data model - homework

## lessons (fields used here)
- `id`, `family_id`, `tutor_id`, `starts_at` (UTC)
- `status` - `scheduled | completed | cancelled | missed`
- `completed_at` - UTC, set when the tutor marks the lesson complete; null until then
- `topics` - JSON list of covered topics, filled by the tutor

## homework_sets
- `id`, `lesson_id` (unique), `child_id`
- `status` - `published | done | expired`
- `published_at` - UTC; a row exists only after the lesson is completed
- `expires_at` - `published_at + 7 days`
- `score_pct` - null until the set is done

## homework_tasks
- `id`, `set_id`, `position`, `prompt`, `kind` (`choice | number | photo`), `correct_answer`
- `answer`, `answered_at`, `is_correct` - filled by the child's submission

## events
- `homework.generate` (payload: `set_id`, `tasks`), `homework.generate_failed`, `homework.opened`
- `homework.opened` with `empty_state = true` means the child opened the tab before publishing.
  Spikes of these right after lessons are normal.

## Invariants
- `homework_sets.lesson_id` references a lesson with `status = completed`; no set exists for other statuses.
- `published_at >= lessons.completed_at`.
- Task order inside a set is stable (`position` is unique per set).
- A child can read only sets of their own family (`child_id` check in the API).

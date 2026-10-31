# Known gotchas - homework

## 1. "Homework is missing" is usually not a bug
- Homework is visible only after the tutor marks the lesson complete.
- Parents and kids often open the tab right after the video call ends, while the lesson is not yet completed.
- Check `lessons.completed_at`: if it is null, the answer is "wait for the tutor". No compensation.

## 2. Tutor completes the lesson late
- Back-to-back lessons delay the completion. Up to 15 minutes is normal; 2 hours triggers an ops alert.
- If a tutor completed the lesson but no set exists, look for `homework.generate_failed` (real problem).

## 3. Cancelled and missed lessons
- A `missed` or `cancelled` lesson never produces homework. This is expected and should be explained gently.

## 4. Expired sets
- A set is hidden 7 days after publishing. Tutors can republish it from the console on request.

## 5. Caching in the kids' app
- The empty state can stay on screen until the app is refreshed. A pull-to-refresh or reopening the tab
  fixes it; the push "New homework is ready" also refreshes the tab.

## 6. Photo tasks
- Photo answers are checked by the tutor, so `is_correct` stays null for a day or two. Not a failure.

## 7. Support tips
- Ask for the lesson id and the time the lesson ended.
- Quote the rule from the family dashboard help: "Homework appears after your tutor completes the lesson".
- Do not escalate to engineering before checking `completed_at`.

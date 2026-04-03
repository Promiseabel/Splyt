---
description: Run a security review on a file or feature using the security-reviewer subagent
---

Use the security-reviewer subagent to review: $ARGUMENTS

After the review:
- If PASS: confirm to user and update PROGRESS.md
- If any FAIL: list all issues and ask user whether to fix now or create tickets in TASKS.md

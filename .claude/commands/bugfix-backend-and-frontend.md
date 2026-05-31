---
name: bugfix-backend-and-frontend
description: Workflow command scaffold for bugfix-backend-and-frontend in super-cli.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /bugfix-backend-and-frontend

Use this workflow when working on **bugfix-backend-and-frontend** in `super-cli`.

## Goal

Fixes a bug that requires coordinated changes in backend logic, API routes, and frontend UI or API client.

## Common Files

- `src/core/*.ts`
- `src/server/routes/*.ts`
- `src/web/src/*.tsx`
- `src/web/src/api/client.ts`
- `src/web/src/index.css`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update backend logic in src/core/ or src/server/
- Update or add API route in src/server/routes/
- Update frontend logic or UI in src/web/src/
- Update API client in src/web/src/api/client.ts
- Update styles if necessary

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.
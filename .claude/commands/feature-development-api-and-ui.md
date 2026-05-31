---
name: feature-development-api-and-ui
description: Workflow command scaffold for feature-development-api-and-ui in super-cli.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development-api-and-ui

Use this workflow when working on **feature-development-api-and-ui** in `super-cli`.

## Goal

Implements a new feature that spans backend API (core/server) and frontend UI (web), including new readers, API routes, and React components.

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

- Add or update core logic (e.g., readers) in src/core/
- Add or update API route in src/server/routes/
- Update or create React component in src/web/src/
- Update API client in src/web/src/api/client.ts
- Update styles in src/web/src/index.css

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.
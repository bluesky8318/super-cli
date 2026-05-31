```markdown
# super-cli Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill provides a comprehensive guide to developing within the `super-cli` TypeScript monorepo, which leverages React for its frontend. It covers coding conventions, commit patterns, and detailed workflows for adding features, fixing bugs, updating documentation, and preparing for publishing. The guide is designed to help contributors maintain consistency and efficiency across backend and frontend development.

## Coding Conventions

### File Naming

- Use **camelCase** for file names.
  - Example: `myComponent.tsx`, `apiClient.ts`

### Import Style

- Use **relative imports** within the codebase.
  - Example:
    ```typescript
    import { fetchData } from './apiClient';
    ```

### Export Style

- Use **named exports** for modules.
  - Example:
    ```typescript
    // In src/utils/format.ts
    export function formatDate(date: Date): string { ... }

    // In another file
    import { formatDate } from '../utils/format';
    ```

### Commit Patterns

- Use **Conventional Commits** with these prefixes: `fix`, `docs`, `feat`, `refactor`, `chore`
- Keep commit messages concise (average ~48 characters).
  - Example:
    ```
    feat: add new user settings API route
    fix: correct typo in login component
    ```

## Workflows

### Feature Development: API and UI

**Trigger:** When adding a new feature that requires both backend (API) and frontend (UI) changes  
**Command:** `/new-feature-api-ui`

1. Add or update core logic (e.g., readers) in `src/core/`
2. Add or update the API route in `src/server/routes/`
3. Create or update the React component in `src/web/src/`
4. Update the API client in `src/web/src/api/client.ts`
5. Update styles in `src/web/src/index.css` if needed
6. Update documentation if necessary

**Example:**
```typescript
// src/core/userReader.ts
export function getUserById(id: string) { ... }

// src/server/routes/user.ts
import { getUserById } from '../../core/userReader';
// define API route

// src/web/src/components/UserProfile.tsx
export function UserProfile(props) { ... }

// src/web/src/api/client.ts
export async function fetchUser(id: string) { ... }
```

---

### Bugfix: Backend and Frontend

**Trigger:** When fixing a bug that affects both backend and frontend  
**Command:** `/bugfix-backend-frontend`

1. Update backend logic in `src/core/` or `src/server/`
2. Update or add API route in `src/server/routes/`
3. Update frontend logic or UI in `src/web/src/`
4. Update API client in `src/web/src/api/client.ts`
5. Update styles in `src/web/src/index.css` if necessary

**Example:**
```typescript
// src/core/fixLogic.ts
export function correctedLogic() { ... }

// src/web/src/components/FixComponent.tsx
export function FixComponent() { ... }
```

---

### Documentation Update

**Trigger:** When documenting new changes or preparing release notes  
**Command:** `/update-docs`

1. Edit `README.md` to add or update feature lists and instructions
2. Edit or merge `CHANGELOG.md` entries
3. Edit other docs (e.g., `AGENTS.md`, `CLAUDE.md`) as needed

**Example:**
```markdown
## New Features
- Added user profile page
```

---

### Project Metadata and Publish Preparation

**Trigger:** When preparing for npm publish or updating project metadata  
**Command:** `/prepare-publish`

1. Edit `package.json` fields (repository, homepage, scripts, license, etc.)
2. Edit `.gitignore` and/or `.npmignore`
3. Edit build config (e.g., `tsup.config.ts`)
4. Update `README.md` license or metadata if needed

**Example:**
```json
// package.json
{
  "name": "super-cli",
  "version": "1.2.3",
  "repository": "https://github.com/org/super-cli"
}
```

## Testing Patterns

- Test files follow the pattern: `*.test.*` (e.g., `userReader.test.ts`)
- Testing framework is **unknown**; check existing test files for conventions.
- Place tests near the code they test or in dedicated test directories.

**Example:**
```typescript
// src/core/userReader.test.ts
import { getUserById } from './userReader';

test('getUserById returns correct user', () => {
  // test implementation
});
```

## Commands

| Command                   | Purpose                                                        |
|---------------------------|----------------------------------------------------------------|
| /new-feature-api-ui       | Start a new feature spanning backend API and frontend UI       |
| /bugfix-backend-frontend  | Fix a bug affecting both backend and frontend                  |
| /update-docs              | Update documentation and release notes                         |
| /prepare-publish          | Prepare project metadata and configs for publishing            |
```

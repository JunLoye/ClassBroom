# Copilot Instructions

This file defines coding conventions and rules for this project. Keep explanations in `CONTRIBUTING.md` — this file is for directives only.

## Naming Conventions

- **Functions & variables:** camelCase (`getUserData`, `isActive`)
- **Classes & types:** PascalCase (`UserService`, `ConfigOptions`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Files:** kebab-case for components (`user-card.tsx`), camelCase for utilities (`helpers.js`)

## Code Style

- Use TypeScript for new code when possible
- Prefer async/await over callbacks
- Use const by default; only use let when reassigning
- Keep functions small (<50 lines); extract into separate functions if longer
- Always add JSDoc comments to exported functions

## Response Size and Session Context

- Default to concise responses (5-10 lines) unless user asks for detail
- Prefer bullet points over long paragraphs for explanations
- Return minimal diffs for code changes; avoid repeating unchanged code
- If a chat exceeds ~10 exchanges, summarize decisions and start a new thread
- Do not paste large logs repeatedly; summarize the signal first

## What NOT to Generate

- **Never** commit secrets, API keys, or credentials in code
- **Never** generate raw SQL queries — use an ORM or prepared statements
- **Never** hardcode user IDs or environment-specific paths
- **Never** commit `yarn.lock` or `package-lock.json` files without review
- **Never** write synchronous file I/O in async contexts

## Testing Requirements

- Every feature gets a corresponding test in `src/__tests__/` or `tests/`
- Use descriptive test names: `test('should validate email format for user signup', ...)`
- Mock external APIs in tests — never make real HTTP requests
- Aim for >80% code coverage on critical paths

## Database & Migrations

- Migrations must never drop columns without a backfill strategy
- Always write both up() and down() for every migration
- Test migrations on production-like data before committing
- Document data transformation logic in migration comments

## Git Conventions

- Commit messages: `type(scope): subject` (e.g., `feat(auth): add password reset flow`)
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Keep commits atomic — one logical change per commit
- Push to a feature branch; never commit directly to main

---

**Token count target:** This file should stay under 500 tokens to avoid bloating request context.
For domain-specific rules, create path-specific `.instructions.md` files in `.github/instructions/`.

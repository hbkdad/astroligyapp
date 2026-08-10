# Repository instructions

## Source of truth

- Read `docs/PROJECT_STATUS.md` first, then the active goal in `docs/GOAL_QUEUE.md`.
- Use `docs/MASTER_BUILD_SPEC.md` for product and architecture requirements.
- Use `docs/ARCHITECTURE.md` and accepted ADRs for implementation decisions. If they conflict with the master specification, stop and record the conflict before changing architecture.
- Keep this file concise. Put repeatable procedures in `.agents/skills/` and evolving state in `docs/PROJECT_STATUS.md`.

## Working method

- Work one dependency-ordered goal at a time. Inspect the repository and existing behavior before editing.
- Preserve unrelated user changes. Never reset, delete, or overwrite work you do not understand.
- Confirm the actual package manager, scripts, runtime, database, CI, and deployment setup; do not invent commands that are not present.
- Update `docs/PROJECT_STATUS.md` after every material milestone with completed work, evidence, decisions, blockers, and the single next goal.
- Use small, reviewable changes. Do not commit, deploy, purchase services, or mutate production without explicit user approval.

## Architecture boundaries

- Keep astronomical and numerological calculation code deterministic, versioned, traceable, and independent from interpretation, AI, UI, billing, and persistence.
- Access astronomical data only through an `EphemerisProvider` boundary. Do not couple domain code to Swiss Ephemeris or any vendor until accuracy, operating model, and current commercial licensing are verified and recorded in an ADR.
- AI may explain validated structured facts; it must never invent or alter positions, phases, aspects, houses, times, scores, or numerology results.
- Keep product-defined scoring configuration separate from calculations and label it as an interpretive heuristic, not scientific measurement.
- Centralize entitlements and server-side authorization. Never trust plan or ownership state supplied by the browser.

## Engineering standards

- Use strict TypeScript when the application scaffold exists. Avoid `any`; justify unavoidable boundary uses locally.
- Validate all external input and provider output at system boundaries. Preserve calculation/provider versions and enough input metadata to reproduce results.
- Test deterministic engines with boundary, wraparound, timezone, Unicode, known-fixture, and failure cases as applicable.
- Treat birth date, exact time, location, names, and relationship profiles as private user data. Keep them out of public URLs, analytics, fixtures, and routine logs.
- Never commit secrets. Use environment variables and maintain a redacted `.env.example` once runtime configuration exists.
- Target WCAG 2.2 AA. Provide keyboard operation, visible focus, sufficient contrast, reduced-motion support, and text equivalents for charts.
- Frame astrology and numerology as interpretive traditions. Never give deterministic medical, legal, financial, relationship, or safety directives from them.

## Required verification

- Use npm for this baseline. Run `npm install` after dependency changes and preserve `package-lock.json`.
- Current commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run db:check`, `npm run test:database`, `npm run build`, and the application gate `npm run check`.
- Generate checked-in migrations with `npm run db:generate`; never use schema push as the normal migration path. Inspect generated SQL and run the disposable PostgreSQL test before accepting it.
- Run the repository's real lint, typecheck, unit, integration, end-to-end, and production-build commands in proportion to the change.
- For calculation changes, invoke the relevant validation skill and record fixture sources, tolerances, versions, and exact commands.
- For database, security, UI, SEO, or release work, invoke the matching repo skill under `.agents/skills/`.
- After substantial UI changes, inspect the critical flow in a real browser at mobile and desktop widths and verify keyboard and reduced-motion behavior.
- Do not call work complete because files exist. Report commands run, outcomes, skipped checks, and remaining risk.

## Definition of done

A goal is done only when implementation and documentation agree; applicable checks pass; calculations are reproducible; security, privacy, accessibility, and claims have been reviewed; and `docs/PROJECT_STATUS.md` identifies the next dependency.

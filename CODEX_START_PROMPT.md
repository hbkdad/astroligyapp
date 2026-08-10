# Codex Project Start Prompt

Use this prompt from the repository root to resume the project from its recorded state. Do not restart completed goals.

## Load the project state

1. Read `AGENTS.md` and follow it.
2. Read `docs/PROJECT_STATUS.md` first and treat its single **Next goal** as the active work item.
3. Read only the relevant sections of `docs/GOAL_QUEUE.md`, `docs/MASTER_BUILD_SPEC.md`, `docs/ARCHITECTURE.md`, and accepted ADRs needed for that goal.
4. Inspect Git status, the package manager, runtime versions, application structure, tests, CI, database configuration, and deployment configuration. Preserve unrelated changes.
5. Confirm repo-scoped skills under `.agents/skills` are discoverable. Invoke relevant workflows explicitly as `$skill-name` when deterministic control helps.
6. Inspect connected MCP servers and available tools before assuming an integration exists. In an interactive client, `/mcp` opens MCP status; `/status` reports chat/context state. If those UI commands are unavailable, inspect the equivalent environment and tool state directly.
7. Inspect `.codex/agents` only if that directory exists. Do not require custom agent files when the project has none.

Do not run `/init` when `AGENTS.md` already exists. Do not use a nonexistent `/skills` command; use the skills UI, `$skill-name`, or the discovered `.agents/skills` folders.

## Execute the active goal

Create a concise working plan for the active goal. Continue from existing implementation and evidence rather than regenerating the scaffold.

Delegate only independent, bounded, read-heavy or non-overlapping work when it materially improves speed or validation. Give each subagent a concrete scope, avoid conflicting file ownership, wait for its result, and verify the result against repository sources before adopting it.

For the active goal:

- verify unstable technical, licensing, security, or provider facts against current primary sources;
- make the smallest architecture decision that preserves the documented boundaries;
- implement the goal completely;
- add deterministic and adversarial tests proportional to risk;
- run the repository's real verification commands;
- invoke the matching repo skills;
- update `docs/PROJECT_STATUS.md` with exact commands, evidence, decisions, blockers, and one next dependency;
- use `/review` or the available review workflow for substantial uncommitted changes.

Do not begin visual polish unless the active dependency is a UI goal.

## Authority boundaries

- Do not commit, deploy, purchase services, create paid resources, apply production migrations, or change live systems without explicit user approval.
- Never add secrets, production credentials, real private birth data, or relationship data to source, fixtures, logs, or prompts.
- Do not couple domain calculations to an ephemeris, database, auth, billing, AI, notification, or deployment vendor without the required decision record.
- Do not present a timeout, skipped check, or file existence as successful verification.

Make reasonable reversible implementation decisions when repository guidance already determines the direction. Stop only for a genuine external blocker, missing authority, an unresolved decision that would materially change the architecture, or an irreversible action requiring owner approval.

# Projects hold a connection mode; single-mode projects run main's warehouse code unchanged

Status: Accepted (2026-09-23).
Supersedes the glossary line "Connections are equal: no primary, no secondary".

## Context

Multiple warehouse connections per project are needed by few organisations; almost every project keeps one connection.

The first implementation, a 19-PR stack, turned every project's `warehouse_credentials` row into a connection at deploy time. It changed the credential, preference, catalog and compile paths for everyone. Review and exploratory testing found regressions that hit customers who never use the feature:
- a broken SQL runner sidebar;
- personal credentials that were ignored, or lost their assume-role ARN;
- compile failures;
- migrations that break the previous binary during a rolling deploy;
- organisation deletion that fails.

This path is business-critical. Single-connection customers must be protected by the structure of the code, not by tests alone.

## Decision

Each project records a **connection mode**, `single` or `multi`.

- **Single-mode projects run main's code** for credentials, personal credentials, compile, the SQL runner sidebar and the catalog. They never read the new tables. `warehouse_credentials` keeps its meaning, columns and constraints.
- **The project's existing credentials are its original connection.** They stay in `warehouse_credentials` in both modes and are always resolved by main's code. The original connection can be edited and renamed, but not deleted.
- **Extra connections live in a new table, `warehouse_connections`,** which also holds a metadata row for the original (its name and database listing settings).
- **Content binds to a connection through a nullable `warehouse_connection_uuid`.** NULL means the original connection, permanently. Foreign keys to connections are deferred, and scoped to the project where the table allows it.
- **One router reads the mode** (Branch by Abstraction). A multi project with no extra connection routes to the single path. "Behaves exactly like single" covers queries, the SQL runner sidebar, compile and credentials. It has three documented exceptions: `connectionMode: 'multi'` in the project API, the "Add connection" entry, and the reachable connections API.
- **Main's save paths stay untouched.** Multi compile saves every connection's explores in one call of its own save method, with the binding carried through staging. Explore names stay unique per project across connections. A failing extra connection's explores are carried forward with a warning, and a failing original fails the compile, as on main.
- **An admin switches a project to multi explicitly**, with a dry run, together with its first extra connection. There is no switch back. Removing every extra connection returns the project to the single path. An extra connection can be removed only when nothing is bound to it. There is no product operation that moves content to the original. Engineering has a rescue runbook.
- **"Require user credentials" is one project-wide setting**, the original's. Every extra connection obeys it, except that an extra connection's org credential that requires personal credentials always wins (fail closed).
- **Only a SQL chart's latest version binds it to a connection.** Older versions fall back to the original when their connection is removed.
- **Deploy-time migrations are expand-only.** There is no contract step.

## Considered options

- **The current stack (convert every project at deploy).** Rejected. It changes shared code for everyone, and it needs three contract migrations: two declared breaking, one of them a required stop for self-hosted, and one undeclared rolling break. Its regressions reached single-connection customers.
- **The hybrid (the current stack's single table, expand now and contract later, plus a shadow comparison of the credential resolver).** Rejected. Protection would rest on tests and shadowing rather than structure. It would still edit main's credential, sidebar and compile code for every customer.
- **A separate table where all connections are equal** (copy the original into the new table at the switch). Rejected. The switch would have to stamp all content, backfill preferences, invalidate caches and lock out every writer. Keeping the original in `warehouse_credentials` makes the switch a small transaction, and keeps "remove extra connections" an exact way back.

## Consequences

- **Two credential paths.** The original always uses main's orchestrator. Extra connections use a separate orchestrator that may only call main's leaf helpers (normalise, org-credential load, token refresh) and main's personal-credential merge. That merge is extracted verbatim into a named helper, behind pinning tests, because main has it inline. A parity test runs both paths over a matrix of warehouse and authentication types. Refactoring them into one pipeline waits until the single = main differential test has been green for several releases.
- **About 40 backend branch sites and about 12 frontend containers.** A required `ConnectionBinding` argument on every warehouse-credential entry point makes the compiler list the backend sites. The frontend branches only at container level.
- **The single path gains one lookup.** Each request that touches a warehouse reads `projects.connection_mode` by primary key. Nothing else changes for single projects.
- **The original connection is special.** It cannot be deleted. Its warehouse type cannot change while extra connections exist. Content without a binding always runs on it.
- **The switch is cheap and safe.** Existing content, preferences and cached results are untouched. The switch is one transaction under the project row lock, and a failure leaves the project single.
- **Rollback is forward-only once an organisation has switched.** An image older than the router would run content bound to an extra connection with the original's credentials.
- **Turning the flag off stops new switches and new extra connections only.** Existing multi projects keep working. This is a documented exception to `docs/feature-flags.md` rule 4.
- **No product way back for bound content.** A customer who wants to leave multi mode must unbind content themselves (rebind dbt sources, save SQL charts on the original), or ask for the engineering rescue. That rescue moves content to the original's warehouse, where its tables may not exist.
- **Delivery is a fresh stack of 11 PRs off `main`**, porting code from the pinned `refs/captain-design-change/spk-N` refs. The multi route is unreachable until the last PR and the flag are both in place.
- **Tests and proof.**
  - Real-schema integration tests.
  - An N-1 schema test on every migration PR.
  - A differential lane on the box, owned by the box explorer, in three legs: candidate against main, control against control, and multi-with-no-extras against single. It must prove determinism and sensitivity before the router PR merges. Snowflake is covered by unit tests, because the box cannot reach it.
  - Every review finding is closed only by an executed proof that fails on the old code, or on a mutant, and passes on the new stack.
- **About two thirds of the old stack's code is ported.** That covers the listing clients, the connection tree and picker, the connections API and per-connection compile. The resolver, personal-credential, dbt-source binding and runtime-identity code is rewritten. The old expand, name-backfill and contract migrations are not ported.
- **Single mode's retirement is out of scope.** If multi connections ever become the default, retiring single mode is a separate Parallel Change (Strangler Fig) with its own ADR.

## Glossary changes

- **Connection mode.** Per project, `single` or `multi`. Recorded on the project. Changed only by the switch.
- **Original connection.** The project's `warehouse_credentials`. It exists in both modes and cannot be deleted. Content with no binding runs on it.
- **Extra connection.** A connection added in multi mode. It can be removed only when nothing is bound to it. _Avoid:_ secondary connection, additional connection (clashes with "additional databases").
- **Route.** What the router decides for a request: `single` (main's code) or `multi`. A multi project with no extra connection routes `single`.
- **Switch.** The admin action that moves a project from single to multi mode, with its first extra connection.
- Remove "Connections are equal: no primary, no secondary". Qualify the term as "warehouse connection" outside this context, because EE also has "external connections".

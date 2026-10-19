# Space-level warehouse connections

Status: research prototype behind the `space-warehouse-connections` feature flag (off by default). Tracks GitHub issue #30027.

## The problem

A customer keeps warehouse permissions in the warehouse. One shared service credential lets any Developer run arbitrary SQL as that credential. "Require personal credentials" fixes that but forces every viewer to paste a warehouse credential before a dashboard loads, which less technical people refuse to do. Splitting one project into one project per credential separates content that belongs together.

The ask: an admin attaches a warehouse credential to a space. Content in that space queries with it. What each person can do with that content is still decided by their Lightdash role on the space. A Developer on the HR space runs SQL as the HR credential. An Interactive Viewer on the HR space sees HR dashboards without entering anything, and cannot run SQL.

## What exists today

| Mechanism                                                                                                 | Scope                                                                                                     | Gap for this ask                                                                                           |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Project connection                                                                                        | one credential per project                                                                                | every Developer runs raw SQL as it                                                                         |
| Personal credentials (required or optional with fallback)                                                 | one credential per person per connection                                                                  | viewers must enter a credential to see sensitive content                                                   |
| Organisation credentials                                                                                  | Snowflake SSO, project creation only                                                                      | not usable at query time per space                                                                         |
| Multiple connections per project (2.589.0, `multi-connection-projects` flag, Postgres, Athena, Snowflake) | several credentials per project, each with its own identity, SQL runner picker, optional personal overlay | a connection is picked by explore, SQL chart or SQL runner choice, never by the space the content lives in |
| "Allow raw SQL" per connection (SPK-2490, backlog)                                                        | Off / Your own credential only / Everyone                                                                 | stops Developers running SQL on a shared credential; does not give a space its own credential              |

Nothing gives space-level behaviour today.

## Design

**A space points at one of the project's warehouse connections.** The credential store is the existing `warehouse_connections` table, so admins manage secrets in one place and one connection can back several spaces. No new credential store.

### Data model

- `spaces.warehouse_connection_uuid uuid NULL`, foreign key to `warehouse_connections(warehouse_connection_uuid)` with `ON DELETE SET NULL`. Deleting a connection unbinds its spaces; content falls back to the project rule.
- The effective connection of a space is the closest ancestor (including itself) with a value, walked through `parent_space_uuid`. A sub-space inherits its parent's connection unless it sets its own.
- Content in a space inherits the space's connection: charts, dashboards, SQL charts, and dashboard-scoped charts through their dashboard's space.

### Permission model

| Action                                                                                                                      | Who                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set or clear a space's connection                                                                                           | project admin (`manage:Project`); the connection must belong to the same project and have the same warehouse type as the project's original connection                                         |
| See which connection a space uses                                                                                           | anyone who can view the space: `GET` space returns `effectiveWarehouseConnection` (uuid, name, warehouse type, and the ancestor space it is inherited from), never credentials or host details |
| View content in the space                                                                                                   | the person's existing space role; the query runs as the space connection                                                                                                                       |
| Run SQL or author SQL on a space-bound connection (SQL runner, catalogue, SQL charts, custom SQL in saved charts, restores) | `manage:SqlRunner` **and** edit access on at least one space that explicitly binds that connection                                                                                             |
| Create or move a space inside a space whose chain sets a connection                                                         | edit access on a space that explicitly binds the reserved connection; `manage:SqlRunner` is not required; unreserved connections keep their existing rule                                      |
| Run SQL on an unbound connection                                                                                            | unchanged: `manage:SqlRunner`                                                                                                                                                                  |

Editing a sub-space that inherits the connection is not enough. Sub-spaces can be created, restored or provisioned by people the admin did not choose. SQL authoring includes SQL charts, custom SQL dimensions, custom SQL metrics and SQL table calculations in saved charts, moves and restores. Creating or moving a space below a bound parent requires edit access on an explicitly bound space before it acquires its connection.

A space-bound connection is therefore reachable from the SQL runner only by people the space admin already trusts to edit that space. A viewer never gets a SQL path to it.

One rule decides this: `SpaceConnectionReservation` (`packages/backend/src/services/SpaceService/SpaceConnectionReservation.ts`). The SQL runner connection list reports it per connection as `canRunSql`, and the same helper refuses SQL runs, estimates, the catalogue (databases, tables, fields, refresh) and SQL chart saves, uploads, promotion and moves. SQL chart saves check the connection the chart will actually run on: the destination space chain first, then the named or stored connection. A null or omitted connection does not bypass the space check. The project's original connection is never reserved, even when a space points at it, so a sub-space can point back at the project default without taking the SQL runner away from everyone else. Agent and MCP SQL tools query the original connection, so the reservation does not reach them.

### Resolution order at query time

```
flag off                       -> today's rule
content in a space whose chain sets a connection
                               -> that connection (space wins)
otherwise                      -> explore / SQL chart / SQL runner choice (multi-connection rule)
otherwise                      -> project connection
```

Within the chosen connection, the existing per-connection rule applies: shared credential, or the person's personal credential when the connection requires or allows one. "Space > personal > project" therefore reads as: the space picks the connection; the connection's own setting decides whether a personal credential overlays it.

### SQL runner and explores

- Explore (ad hoc, outside any space): project rule. A space connection never applies to a query that has no space.
- SQL runner: the connection picker lists every connection; a reserved one is disabled with "Reserved for a space you cannot edit", the header switcher hides it, and the runner never selects it by default. The server refuses it whatever the client sends.
- Saving a chart into a space does not copy credentials. The next run resolves through the space.
- Moving content between spaces changes which connection it runs on. The move needs edit access on both spaces already. A SQL chart move also checks access to its effective destination connection.

### Space page and settings

- The space page shows the effective connection with the existing `ConnectionBadge`, next to the breadcrumbs, under the existing multi-connection badge rule (multi-connection project with two or more connections). The tooltip says "Inherited from <space>" on a sub-space that inherits.
- The space settings picker offers "Inherit from <parent space or project> (<connection>)" plus the project's connections of the original's warehouse type. With no bound ancestor the inherited value is the project rule, shown as "each chart's own connection".

### Scheduler, alerts, async queries

Scheduled deliveries and alerts run as their creator through the same resolver, so a chart in the HR space is delivered with the HR connection. If the HR connection requires a personal credential and the creator has none, the delivery fails for that tile with the existing message. Async query history stores the resolved `warehouseConnectionUuid`, so underlying-data and re-reads of stored results keep the same connection.

### Caching

The results cache key already includes `warehouseConnectionUuid`, so results from the HR connection are never served to a query that resolved to another connection. Changing a space's connection changes the key for every piece of content in that space, which invalidates by construction. Saved charts with an effective space connection bypass pre-aggregates and run on the warehouse. Totals and unbounded reruns retain the source query's connection. The SQL runner table catalogue remains per connection.

### Interaction with "Allow raw SQL" (SPK-2490)

The two compose. "Allow raw SQL" is the coarse switch on a connection; the space binding is who may reach that connection at all. A customer who wants viewers on a shared credential and SQL only under a personal credential uses SPK-2490. A customer who wants a different identity per team space uses this. SPK-2490 alone does not meet the ask in #30027.

## Where it plugs into credential resolution

Every warehouse query now resolves through one seam, `WarehouseClientFactory.resolveWarehouseCredentials(ref, context)` (`packages/backend/src/services/WarehouseClientFactory/WarehouseClientFactory.ts`), built up by the agent identity work. It has two layers:

| Layer                                 | Question                    | Implemented by                                                                                                                                                                                                         | Space-level credentials                                                                                                                                                                        |
| ------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadBase`                            | Which connection row?       | `WarehouseConnectionRouter.resolveCredentialReadWithRoute` over a `ConnectionBinding` (explore, SQL chart, query, connection, original)                                                                                | **Plugs in here.** The prototype adds a `space` binding with a fallback. Nothing below it changes.                                                                                             |
| `finish` / `resolveLoadedCredentials` | Who inside that connection? | `CredentialResolverRegistry` keyed by warehouse type and auth mode: shared credential, personal overlay (`personalCredentialOverlay.ts`), AI service account, agent sign-in, SSH transport; token refresh and rotation | Untouched. A space connection gets the same identity rules as any other connection: personal credential when the connection requires or allows one, the agent identity rule for agent queries. |

`ConnectionContext` (`ConnectionContext.ts`) carries the actor: surface (app, in-app agent, Slack, MCP, CLI, schedule, embed, data app), the person, the AI client and the agent identity claim. It does not carry where the content lives, and it does not need to: the binding already names the content (chart, SQL chart, query), and the space is a property of that content.

The read side is separate. `QueryResultProducer` records `warehouseConnectionUuid`, the credential owner and the agent claim for every stored result, and `AiAccessService.assertCanReadResults` compares producer with reader. `AiAgentService.canPersonReadAgentResult` (PR #31103) is the rule for a person reading what their agent produced. Space credentials need no new rule there: a result produced with the HR connection carries that connection uuid, and content access on the chart is what decides who may open it. User impersonation is an admin session as another person and resolves exactly as that person, so it is orthogonal too; it was the workaround the customer used.

### How much it reduces the work

| Without the seam (what the issue's suggested approach implied)                                                                       | With the seam (this prototype)                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A new credential store for space credentials, or a reuse of organisation credentials with a new assignment table                     | A nullable pointer column on `spaces`                                                          |
| A second resolution path in `ProjectService.getWarehouseCredentials` and in every caller that bypasses it                            | One `ConnectionBinding` variant, resolved in the router that every caller already goes through |
| Personal credential overlay, token refresh, rotation locks and SSH transport reimplemented or special-cased for the space credential | Inherited per connection                                                                       |
| Results cache key, query history and stored-result lineage extended with a space credential id                                       | Already keyed by `warehouseConnectionUuid`                                                     |
| Agent and MCP queries handled separately                                                                                             | Inherited: the agent identity rule runs in `finish` after the space picks the connection       |
| SQL runner catalogue per credential                                                                                                  | Already per connection                                                                         |

The backend prototype is about 350 lines of product code plus tests, and it did not touch a resolver, the factory, the overlay, the cache key or the result lineage. The remaining work is product, not plumbing: warehouse-type support for Trino in multi-connection and the explore-versus-space host mismatch risk below.

What the seam does not give: a per-content "which connection" decision for ad hoc explores (there is no content yet), and a place to express "same host, different identity" as a first-class credential kind. The credentials-as-rows work (SPK-2659) will add a `credential_bindings` slot table; a space slot there would be the long-term home of `spaces.warehouse_connection_uuid`.

## Risks

- **Explore and space disagree.** An explore compiled on connection A whose chart sits in a space bound to connection B runs A's SQL with B's credential. That is the intended case when A and B are the same warehouse with different identities. It breaks when B points at a different host or catalogue. The prototype limits bindings to the original's warehouse type, on the server and in the picker. It does not compare hosts: that needs a per-type host identity and a server-side flag for the picker, because the client never sees hosts. A release should add the host check, or compile per connection.
- **Explicit binding is the trust boundary.** Only editors of an explicitly bound space with `manage:SqlRunner` can run or author SQL on its reserved connection. Inheriting sub-space editors can view existing content but cannot acquire SQL access through child-space creation, restoration or personal-space provisioning.
- **Multi-connection gate.** This rides on `multi-connection-projects`, which is Enterprise and limited to Postgres, Athena and Snowflake. The driving customer is on Trino. Adding Trino to the same-type `MULTI_CONNECTION_SUPPORT` allowlist is not in this prototype: the mixed-warehouse scale test (#31096) ran Trino extras under other primaries but never a Trino primary with a Trino extra.
- **Credentials-as-rows migration (SPK-2659).** When connections move into the credential catalogue, `spaces.warehouse_connection_uuid` keeps pointing at a connection row, so the binding survives.
- **Content-as-code and promotion** do not carry the space binding yet. Promoting a space to another project leaves the target space unbound.
- **Agent and MCP.** Agent queries over space content resolve the same way. Agent `run_sql` naming a bound connection follows the SQL runner rule for the person the agent runs as.
- **Explores on a reserved connection.** An explore whose dbt source runs on a space-bound connection still runs for anyone who can explore. The reservation covers raw SQL only. Custom SQL dimensions, custom SQL metrics and table calculations on such an explore are also not covered.
- **SQL charts outside the bound space.** Someone who may use a reserved connection can save a SQL chart that names it into another space. People who can view that chart then see its results.
- Merged charts in a bound space run each source on its explore's connection; the space binding does not reach merge sources yet.

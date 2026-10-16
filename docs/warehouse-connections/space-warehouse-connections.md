# Space-level warehouse connections

Status: research prototype behind the `space-warehouse-connections` feature flag (off by default). Tracks GitHub issue #30027.

## The problem

A customer keeps warehouse permissions in the warehouse. One shared service credential lets any Developer run arbitrary SQL as that credential. "Require personal credentials" fixes that but forces every viewer to paste a warehouse credential before a dashboard loads, which less technical people refuse to do. Splitting one project into one project per credential separates content that belongs together.

The ask: an admin attaches a warehouse credential to a space. Content in that space queries with it. What each person can do with that content is still decided by their Lightdash role on the space. A Developer on the HR space runs SQL as the HR credential. An Interactive Viewer on the HR space sees HR dashboards without entering anything, and cannot run SQL.

## What exists today

| Mechanism | Scope | Gap for this ask |
| --- | --- | --- |
| Project connection | one credential per project | every Developer runs raw SQL as it |
| Personal credentials (required or optional with fallback) | one credential per person per connection | viewers must enter a credential to see sensitive content |
| Organisation credentials | Snowflake SSO, project creation only | not usable at query time per space |
| Multiple connections per project (2.589.0, `multi-connection-projects` flag, Postgres, Athena, Snowflake) | several credentials per project, each with its own identity, SQL runner picker, optional personal overlay | a connection is picked by explore, SQL chart or SQL runner choice, never by the space the content lives in |
| "Allow raw SQL" per connection (SPK-2490, backlog) | Off / Your own credential only / Everyone | stops Developers running SQL on a shared credential; does not give a space its own credential |

Nothing gives space-level behaviour today.

## Design

**A space points at one of the project's warehouse connections.** The credential store is the existing `warehouse_connections` table, so admins manage secrets in one place and one connection can back several spaces. No new credential store.

### Data model

- `spaces.warehouse_connection_uuid uuid NULL`, foreign key to `warehouse_connections(warehouse_connection_uuid)` with `ON DELETE SET NULL`. Deleting a connection unbinds its spaces; content falls back to the project rule.
- The effective connection of a space is the closest ancestor (including itself) with a value, walked through `parent_space_uuid`. A sub-space inherits its parent's connection unless it sets its own.
- Content in a space inherits the space's connection: charts, dashboards, SQL charts, and dashboard-scoped charts through their dashboard's space.

### Permission model

| Action | Who |
| --- | --- |
| Set or clear a space's connection | project admin (`manage:Project`); the connection must belong to the same project |
| See which connection a space uses | anyone who can view the space (name only, never secrets) |
| View content in the space | the person's existing space role; the query runs as the space connection |
| Run SQL on a space-bound connection (SQL runner, SQL charts, agent and MCP `run_sql`) | `manage:SqlRunner` **and** editor or above on at least one space bound to that connection |
| Run SQL on an unbound connection | unchanged: `manage:SqlRunner` |

A space-bound connection is therefore reachable from the SQL runner only by people the space admin already trusts to edit that space. A viewer never gets a SQL path to it.

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
- SQL runner: the connection picker lists only connections the person may use. Space-bound connections appear when the person edits a bound space. The server refuses the rest.
- Saving a chart into a space does not copy credentials. The next run resolves through the space.
- Moving content between spaces changes which connection it runs on. The move needs edit access on both spaces already.

### Scheduler, alerts, async queries

Scheduled deliveries and alerts run as their creator through the same resolver, so a chart in the HR space is delivered with the HR connection. If the HR connection requires a personal credential and the creator has none, the delivery fails for that tile with the existing message. Async query history stores the resolved `warehouseConnectionUuid`, so underlying-data and re-reads of stored results keep the same connection.

### Caching

The results cache key already includes `warehouseConnectionUuid`, so results from the HR connection are never served to a query that resolved to another connection. Changing a space's connection changes the key for every piece of content in that space, which invalidates by construction. Pre-aggregates and the SQL runner table catalogue are per connection today and need no change.

### Interaction with "Allow raw SQL" (SPK-2490)

The two compose. "Allow raw SQL" is the coarse switch on a connection; the space binding is who may reach that connection at all. A customer who wants viewers on a shared credential and SQL only under a personal credential uses SPK-2490. A customer who wants a different identity per team space uses this. SPK-2490 alone does not meet the ask in #30027.

## Risks

- **Explore and space disagree.** An explore compiled on connection A whose chart sits in a space bound to connection B runs A's SQL with B's credential. That is the intended case when A and B are the same warehouse with different identities. It breaks when B points at a different host or catalogue. The prototype allows any connection of the project; a release should limit the picker to connections of the same warehouse and host, or compile per connection.
- **Credential sprawl in the SQL runner.** A Developer who edits one HR sub-space can run SQL on the HR connection. That is the customer's stated expectation; document it.
- **Multi-connection gate.** This rides on `multi-connection-projects`, which is Enterprise and limited to Postgres, Athena and Snowflake. The driving customer is on Trino. Adding Trino to `MULTI_CONNECTION_WAREHOUSE_TYPES` is a separate, small change and is not in this prototype.
- **Credentials-as-rows migration (SPK-2659).** When connections move into the credential catalogue, `spaces.warehouse_connection_uuid` keeps pointing at a connection row, so the binding survives.
- **Content-as-code and promotion** do not carry the space binding yet. Promoting a space to another project leaves the target space unbound.
- **Agent and MCP.** Agent queries over space content resolve the same way. Agent `run_sql` naming a bound connection follows the SQL runner rule for the person the agent runs as.

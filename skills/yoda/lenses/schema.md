# Schema

## Review

- **Skip when:** no migration, stored JSON shape change or widening of accepted values written to existing columns.
- **Worst case:** data is lost or corrupted, or a rollback cannot run.
- **Evidence:** read up/down migration and previous-release compatibility coverage, including selected CI tests.
- **reversible:** `down()` undoes `up()` without losing data that existed before.
  Dropping what `up()` added is fine; dropping or rewriting old data is Fix.
- **old code runs:** old readers/writers must work with the new schema during rolling deploys, including new NOT NULL columns.
  Incompatible changes need expand then contract in separate PRs; otherwise Fix.
- **no lock:** no long lock or rewrite on a large table (saved charts, dashboards, users, query history, scheduler logs).
  An index without `CONCURRENTLY`, a type change or a default that rewrites rows on one of those is Heads-up.
- **backfill:** existing rows get a correct value, or the code handles null.
  Old rows silently wrong is Fix.
- **app agrees:** entity types, model queries and the migration describe the same columns and nullability.
  Newly accepted values fit existing column types, lengths and constraints.
- **org scoped:** a new table holding customer data carries an org or project key, and model queries filter on it.
- **constraints:** intentional foreign-key `ON DELETE`, unique/check constraints matching code assumptions, `timestamptz` timestamps and `jsonb`.
  Constraints keep existing rows and old inserts valid during rolling deploys.
- **data migration safe:** a data migration is idempotent, can be re-run, and handles null and legacy rows.

## Impact

- **breaking:** dropped/renamed columns, narrowed types or constraints invalidate existing use/data.
- **notable:** new table/column, big-table index, backfill or intended row changes.
- **minor:** small-table index or comment.

## Diff

```ts
type SchemaDiff = Diff & {
    type: string;  // the column type, `index`, `table`, or `rows` for a change to existing data; "old → new" when modified
};
```

- **Name:** `table.column`, or the table or index name.
- **Granularity:** one diff per change, in migration order.
  A rename is `modified` with `old → new` in `name`.
- A migration that touches existing rows always gets a `rows` diff, with `update`, `insert` or `delete` in the note; no such diff means existing data is untouched.

```json
{ "lens": "Schema", "change": "modified", "impact": "notable", "name": "organization_settings", "type": "rows", "note": "insert" }
```

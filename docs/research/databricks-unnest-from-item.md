# Databricks FROM item for unnesting repeated columns

Research date: 2026-09-14. Ticket: PROD-11231.

Sources were read at these revisions:

- Databricks SQL reference pages on docs.databricks.com, each stamped
  "Last updated on Sep 11, 2026".
- `apache/spark` at
  [`07d92669ccd2c873bb5fca7aa1aaee7c463e6d70`](https://github.com/apache/spark/tree/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70)
  (master, 2026-09-14) for the parser grammar, the lateral-join regression
  suite, and operator documentation.
- Lightdash `main` at `eb5547ebd4` for the compiler and renderer.

## Conclusion

Use a lateral table-valued function call as the FROM item:

```sql
LEFT OUTER JOIN LATERAL posexplode_outer(<parent>.<segment>)
  AS `<alias>`(`<alias>__offset`, col) ON TRUE
```

It is the form Databricks documents as the replacement for `LATERAL VIEW`,
it is grammatical as the right operand of a `LEFT OUTER JOIN ... ON`, it
keeps parents whose array is `NULL` or empty, it exposes a 0-based position,
and it chains by correlating on the previous alias. It requires Databricks
SQL (any channel) or Databricks Runtime 12.2 LTS and above. The one thing it
changes for the compiler is how a leaf is addressed: the TVF alias is a
two-column row, not the element, so a leaf is `alias.col.<path>` and a scalar
element is `alias.col`, where BigQuery uses `alias.<path>` and bare `alias`.

Ranking of the candidates examined:

| Rank | FROM item | Join operand | Outer | Position | Chains | Leaf reference | Minimum version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `LATERAL posexplode_outer(x) AS a(pos, col)` | yes | yes | `pos` (0-based) | yes | `a.col.sku` | DBSQL / DBR 12.2 LTS |
| 2 | `LATERAL (SELECT pos AS a__offset, col.* FROM posexplode_outer(x)) AS a` | yes | yes | aliased column | yes | `a.sku` | DBSQL / DBR 13.0 (needs live check) |
| 3 | `LATERAL inline_outer(x) AS a` | yes | yes | none | yes | `a.sku` | DBSQL / DBR 12.2 LTS |
| 4 | `LATERAL VIEW OUTER posexplode(x) a AS pos, col` | no | yes | `pos` | yes | `a.col.sku` | deprecated since DBR 12.2 |
| 5 | `LATERAL UNNEST(x) WITH ORDINALITY AS a` | yes | yes | 1-based | yes | unknown | Spark 4.3.0 only, not on Databricks |

Rank 3 is only viable if the position column is dropped for Databricks. Rank
4 cannot fit the renderer at all. Rank 5 is a watch item.

## The slot the FROM item must fit

`getUnnestFromSql` in
[`packages/common/src/compiler/translator.ts`](../../packages/common/src/compiler/translator.ts)
returns the whole FROM item, alias included, because the BigQuery offset alias
has to follow the table alias and the join renderer only appends an `ON`
clause. The BigQuery branch returns
`UNNEST(parent.seg) AS alias WITH OFFSET AS alias__offset`; every other
adapter throws `NotSupportedError`.

The renderer in
[`packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts`](../../packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts)
emits `${joinType} ${joinTable}\n  ON ${parsedSqlOn}` for a table with
`nestedFrom`, skipping its own `AS alias`; the join is registered with
`sql_on: 'TRUE'`, `type: 'left'`, one-to-many. The Databricks string therefore
has to start with `LATERAL` itself; the renderer will not add it.

Three other pieces of compiler output are shaped by the BigQuery form and are
the places a Databricks form has to fit or change:

- A leaf's SQL is `defaultSql(column.name)`, which is `${TABLE}.<remainder>`
  ([`packages/common/src/types/field.ts`](../../packages/common/src/types/field.ts),
  `defaultSql`), and `${TABLE}` resolves to the quoted current table alias
  ([`packages/common/src/compiler/exploreCompiler.ts`](../../packages/common/src/compiler/exploreCompiler.ts),
  `ref === 'TABLE'` branch). With `UNNEST ... AS alias` the alias is the
  element, so `alias.sku` works on BigQuery.
- An array of scalars becomes a single `value` dimension whose SQL is bare
  `${TABLE}` (`getScalarElementColumn` in `translator.ts`).
- The offset dimension's SQL is the bare quoted identifier
  `alias__offset` (`getOffsetColumnSql` in `translator.ts`).

Databricks quotes identifiers with backticks
([`packages/warehouses/src/warehouseClients/DatabricksWarehouseClient.ts`](../../packages/warehouses/src/warehouseClients/DatabricksWarehouseClient.ts),
`getFieldQuoteChar`).

## Prior art, read but not adopted

Closed PRs [#24273](https://github.com/lightdash/lightdash/pull/24273) and
[#24330](https://github.com/lightdash/lightdash/pull/24330) (PROD-8297)
unnested a selected array dimension through
`WarehouseSqlBuilder.unnestDimension`, which on Databricks returned
`LATERAL VIEW explode(<arrayColumnSql>) <alias>_view AS <alias>`. The
fragment was appended after all joins because that is where Spark's grammar
puts it, and the tests assert that ordering (`LATERAL VIEW comes after JOIN
when explore has a plain join`). A code comment in #24330 records the
consequence: "Inner explode: rows whose array is NULL or empty drop out of
the breakdown". #24273's description says per-element unnesting was verified
against a live Databricks warehouse, which is the only live evidence either
PR carries. There is no position column in either.

None of that transfers to the current design: the renderer needs a join
operand, the semantics need outer, and `LATERAL VIEW` is deprecated on the
versions that offer the alternative (below).

## Primary-source findings

### Grammar: what can be a join operand

Databricks' `table_reference` grammar lists, among its alternatives,
`table_reference JOIN clause`, `[ LATERAL ] table_valued_function [ table_alias ]`
and `[ LATERAL ] ( query ) [ TABLESAMPLE clause ] [ table_alias ]`. The
`JOIN` clause is `{ [ join_type ] JOIN right_table_reference [ join_criteria ] | ... }`
with `join_type` including `LEFT [ OUTER ]` and `join_criteria` including
`ON boolean_expression`. A lateral TVF or lateral subquery is therefore a
valid `right_table_reference` of a `LEFT OUTER JOIN ... ON`.
[table reference](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-table-reference),
[JOIN](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-join)

`LATERAL VIEW` is not a `table_reference`. The `SELECT` grammar is
`FROM table_reference [, ...] [ LATERAL VIEW clause ] [ WHERE clause ] ...`,
so the clause follows every table reference in the FROM clause. Spark's
parser says the same: `fromClause : FROM relation (COMMA relation)* lateralView* ...`
and `joinRelation : (joinType) JOIN LATERAL? right=relationPrimary joinPostfix?`,
where `relationPrimary` has no `lateralView` alternative. It cannot appear
where the renderer puts `<sqlTable>`.
[SELECT](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select),
[SqlBaseParser.g4](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBaseParser.g4)

The clause is also deprecated where the alternative exists: "In Databricks
SQL and starting with Databricks Runtime 12.2 this clause is deprecated. You
should invoke a table valued generator function as a table_reference." Its
`OUTER` note is the only Databricks sentence that spells out the empty case:
"If OUTER specified, returns null if an input array/map is empty or null."
[LATERAL VIEW clause](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-lateral-view)

### Lateral TVF: keywords, correlation, aliases, ON

- Generator functions as table references: "Any table-valued generator
  function, such as explode. Applies to: Databricks SQL, Databricks Runtime
  12.2 LTS and above." Syntax `function_name ( [ expression [, ...] ] ) [ table_alias ]`.
  The page's example `SELECT * FROM VALUES(1), (2) AS t1(c1), LATERAL explode (ARRAY(3,4)) AS t2(c2)`
  shows `AS alias(column)` on a generator.
  [TVF invocation](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-tvf)
- Correlation needs the keyword: "To refer to columns exposed by a preceding
  table_reference in the same FROM clause you must specify LATERAL."
  Column lists on an alias: "If the table_alias includes column_identifiers
  their number must match the number of columns in the table_reference"
  (`NUM_TABLE_VALUE_ALIASES_MISMATCH`).
  [table reference](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-table-reference)
- Spark's grammar accepts `AS` and a column list on a TVF alias:
  `tableAlias : (AS? strictIdentifier identifierList?)?`, applied by
  `tableFunctionCallWithTrailingClauses : tableFunctionCall ... tableAlias`;
  the join criteria rule is `joinCriteria : ON booleanExpression | USING identifierList`.
  So `LEFT OUTER JOIN LATERAL posexplode_outer(x) AS a(p, c) ON TRUE` parses.
  [SqlBaseParser.g4](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBaseParser.g4)
- Spark's regression suite runs exactly this shape, `ON` included:
  `SELECT * FROM t3 LEFT JOIN LATERAL posexplode_outer(c2) t(pos, c3) ON t3.c1 = c3;`,
  plus `LEFT JOIN LATERAL INLINE(arr) t(k, v) ON id = k` and
  `t1 JOIN LATERAL posexplode(ARRAY(c1, c2)) t(pos, c3) ON t1.c1 = c3`.
  [join-lateral.sql](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/test/resources/sql-tests/inputs/join-lateral.sql)
- Left outer is the only outer join type allowed with lateral correlation.
  Spark's error catalogue: "The <joinType> JOIN with LATERAL correlation is
  not allowed because an OUTER subquery cannot correlate to its join partner.
  Remove the LATERAL correlation or use an INNER JOIN, or LEFT OUTER JOIN
  instead." `USING` is unsupported with lateral correlation, and the join
  condition must be deterministic; `TRUE` is.
  [error-conditions.json](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/common/utils/src/main/resources/error/error-conditions.json)
- Omitting the criteria is not an option the renderer takes, and would not
  hurt if it did: "If you omit the join_criteria the semantic of any
  join_type becomes that of a CROSS JOIN." Databricks' own lateral join
  examples omit it.
  [JOIN](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-join)
- Where it landed: the DBR 12.2 LTS notes (Spark 3.3.2) list "Invoke
  generator functions in the FROM clause", SPARK-41595 (explode/explode_outer
  in FROM), SPARK-41961 ("Support table-valued functions with LATERAL") and
  SPARK-42119 (inline/inline_outer TVFs). SPARK-41961's own example is
  `select * from t, lateral explode(array(t.c1, t.c2))`, fixed in Spark 3.4.0
  and backported here.
  [DBR 12.2 LTS release notes](https://docs.databricks.com/aws/en/release-notes/runtime/12.2lts),
  [SPARK-41961](https://issues.apache.org/jira/browse/SPARK-41961)

### The generator functions

| Function | Columns (array input) | `NULL` collection | Placement, DBR 12.2+ |
| --- | --- | --- | --- |
| `posexplode_outer` | `pos`, `col` | "a single row with NULLs" | table_reference; LATERAL VIEW/SELECT deprecated |
| `posexplode` | `pos`, `col` | "no rows are produced" | same |
| `explode_outer` | `col` | one NULL row | same |
| `inline_outer` | one column per struct field, named after the field | "a single row with NULLs for each column" | same |
| `inline` | same | "no rows are produced" | same |

Sources:
[posexplode_outer](https://docs.databricks.com/aws/en/sql/language-manual/functions/posexplode_outer),
[posexplode](https://docs.databricks.com/aws/en/sql/language-manual/functions/posexplode),
[explode_outer](https://docs.databricks.com/aws/en/sql/language-manual/functions/explode_outer),
[inline_outer](https://docs.databricks.com/aws/en/sql/language-manual/functions/inline_outer),
[inline](https://docs.databricks.com/aws/en/sql/language-manual/functions/inline).

Positions are 0-based: the `posexplode_outer` page's own output is
`0 10 / 1 20`, matching BigQuery's `WITH OFFSET`. The same page carries the
chaining precedent, a lateral TVF correlated on a previous TVF's output:
`SELECT p1.*, p2.* FROM posexplode_outer(array(1, 2)) AS p1, LATERAL posexplode_outer(array(3 * p1.col, 4 * p1.col)) AS p2`.
[posexplode_outer](https://docs.databricks.com/aws/en/sql/language-manual/functions/posexplode_outer)

Empty arrays: the Databricks function pages only spell out the `NULL` case.
The outer behaviour comes from Spark's `Generate` operator, whose `outer`
flag is documented as "when true, each input row will be output at least
once, even if the output of the given generator is empty", and the regression
results show it: with `t3` containing `(2, ARRAY())`, `LEFT JOIN LATERAL posexplode_outer(c2) t(pos, c3) ON t3.c1 = c3`
returns `2 [] NULL NULL`, and `t3, LATERAL EXPLODE_OUTER(c2) t2(v)` returns
`2 [] NULL`. Needs live check on a Databricks SQL warehouse only to confirm
the platform matches upstream.
[basicLogicalOperators.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/plans/logical/basicLogicalOperators.scala),
[join-lateral.sql.out](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/test/resources/sql-tests/results/join-lateral.sql.out)

`inline_outer` has no position and takes only the array, so it cannot be
combined with `posexplode` in one call. Wrapping the array first
(`inline_outer(transform(arr, (e, i) -> named_struct('offset', i, 'element', e)))`)
yields `a.offset` and `a.element.sku`, which is no shorter than
`posexplode_outer`'s `a.pos` and `a.col.sku`, so it was not pursued.

### How results are referenced

- Element and its fields: the TVF alias names a two-column row, so the
  element is `alias.col` and a struct field is `alias.col.sku`. Databricks
  resolves a qualified name by peeling the trailing identifier as a field and
  matching the remainder to a column in a FROM table reference, repeating
  while identifiers remain ("Struct field or map key reference", steps A to
  C), so `alias.col.attributes.colour` resolves as table `alias`, column
  `col`, fields `attributes.colour`. "Fields and keys can never be
  unqualified."
  [Name resolution](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-name-resolution),
  [Field name](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-names)
- Array of scalars: `posexplode_outer(tags) AS alias(pos, col)` gives the
  element as `alias.col`. There is no resolution rule that turns a bare table
  alias into a row value, so BigQuery's bare `${TABLE}` for the scalar
  element will not carry over (needs live check only to capture the exact
  error).
- Position: `alias.pos` by default. The alias column list renames it; with
  `AS alias(alias__offset, col)` the position is an ordinary column named
  `alias__offset` and the compiler's existing bare
  `` `alias__offset` `` reference resolves under the plain "Column reference"
  rule as long as no other FROM item exposes that name, which the explore's
  reserved-name check already guarantees for the alias itself. Needs live
  check with a backtick-quoted alias and column list; the grammar allows
  quoted identifiers in both positions, the Databricks examples only show
  bare ones.
- Star on the element: `col.*` expands a struct-typed column into its
  fields ("If name is a column or field name of type STRUCT, lists the fields
  in the specified referenceable column or field"), which is what rank 2
  relies on.
  [* (star) clause](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-star)

### Lateral subquery (rank 2)

`[ LATERAL ] ( query ) [ table_alias ]`: "A query prefixed by LATERAL may
reference columns exposed by a preceding table_reference in the same FROM
clause." Databricks shows it as a left join operand
(`LEFT JOIN LATERAL (SELECT deptname FROM department WHERE employee.deptno = department.deptno)`).
The version badge on the page is the unqualified "Databricks SQL, Databricks
Runtime".
[table reference](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-table-reference),
[JOIN](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-join)

The variant needed here puts the correlated generator inside the subquery's
FROM: `LATERAL (SELECT pos, col.* FROM posexplode_outer(parent.seg))`.
Spark tests that shape (`SELECT * FROM t1, LATERAL (SELECT * FROM EXPLODE(ARRAY(c1, c2)))`,
`t3 LEFT JOIN LATERAL (SELECT EXPLODE(c2)) t(c3) ON c1 = c3`), and it depends
on SPARK-41441, "Allow Generate with no required child output to host outer
references", fixed in Spark 3.4.0. The DBR 13.0 notes (Spark 3.4.0) list
SPARK-41441; the DBR 12.2 LTS notes do not. Treat rank 2 as DBR 13.0+ and
needs live check on Databricks SQL. Its payoff is that the alias becomes the
element again, so `alias.sku`, `alias.variants` and the bare offset all keep
their BigQuery shape; its cost is one subquery per unnest and an extra
decorrelation step in the plan.
[join-lateral.sql](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/test/resources/sql-tests/inputs/join-lateral.sql),
[SPARK-41441](https://issues.apache.org/jira/browse/SPARK-41441),
[DBR 13.0 release notes](https://docs.databricks.com/aws/en/release-notes/runtime/13.0)

### ANSI UNNEST (rank 5, watch item)

Spark master now parses
`UNNEST ( expression [, ...] ) [ WITH ORDINALITY ] [ table_alias ]` as a
`relationPrimary`, with a 1-based `BIGINT` ordinality column, NULL padding
across parallel arrays, and the ticket explicitly notes that
"LEFT JOIN LATERAL UNNEST(...) ON true" preserves outer rows with empty or
NULL arrays. Fix version is Spark 4.3.0 (commit 2026-07-31). The Databricks
`table_reference` page, updated 2026-09-11, does not list `UNNEST`, and no
Databricks release note mentions it, so it is not usable today. If it ships,
it would be the closest match to the BigQuery form, with the caveat that
ordinality is 1-based where `WITH OFFSET` is 0-based.
[SPARK-58419](https://issues.apache.org/jira/browse/SPARK-58419),
[SqlBaseParser.g4](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBaseParser.g4)

## Recommended SQL for the three fixtures

Fixture table, catalogue-qualified as dbt would render it:

```sql
CREATE TABLE cat.sch.transactions (
  id STRING,
  product ARRAY<STRUCT<
    sku STRING,
    price DOUBLE,
    attributes STRUCT<colour STRING>,
    variants ARRAY<STRUCT<size STRING>>
  >>,
  tags ARRAY<STRING>
);
```

Virtual table names follow `getNestedTableName`: `transactions__product`,
`transactions__tags`, `transactions__product__variants`. Every join below is
what the renderer prints for `type: 'left'` with `sql_on: 'TRUE'`; only the
`<sqlTable>` part is Databricks-specific.

### 1. Array of structs

```sql
SELECT
  `transactions`.id                                    AS `transactions_id`,
  `transactions__product`.col.sku                      AS `transactions__product_sku`,
  `transactions__product`.col.price                    AS `transactions__product_price`,
  `transactions__product`.col.attributes.colour        AS `transactions__product_attributes_colour`,
  `transactions__product__offset`                      AS `transactions__product_offset`
FROM `cat`.`sch`.`transactions` AS `transactions`
LEFT OUTER JOIN LATERAL posexplode_outer(`transactions`.product)
  AS `transactions__product`(`transactions__product__offset`, col)
  ON TRUE
```

A transaction with `product = NULL` or `product = ARRAY()` yields one row
with `NULL` in every `transactions__product` column, including the offset.

### 2. Array of scalars

```sql
SELECT
  `transactions`.id                 AS `transactions_id`,
  `transactions__tags`.col          AS `transactions__tags_value`,
  `transactions__tags__offset`      AS `transactions__tags_offset`
FROM `cat`.`sch`.`transactions` AS `transactions`
LEFT OUTER JOIN LATERAL posexplode_outer(`transactions`.tags)
  AS `transactions__tags`(`transactions__tags__offset`, col)
  ON TRUE
```

### 3. Chain: variants inside each product

```sql
SELECT
  `transactions`.id                                    AS `transactions_id`,
  `transactions__product`.col.sku                      AS `transactions__product_sku`,
  `transactions__product__offset`                      AS `transactions__product_offset`,
  `transactions__product__variants`.col.size           AS `transactions__product__variants_size`,
  `transactions__product__variants__offset`            AS `transactions__product__variants_offset`
FROM `cat`.`sch`.`transactions` AS `transactions`
LEFT OUTER JOIN LATERAL posexplode_outer(`transactions`.product)
  AS `transactions__product`(`transactions__product__offset`, col)
  ON TRUE
LEFT OUTER JOIN LATERAL posexplode_outer(`transactions__product`.col.variants)
  AS `transactions__product__variants`(`transactions__product__variants__offset`, col)
  ON TRUE
```

The second join's argument goes through `.col`: the parent alias is a TVF
row, so the array lives at `parent.col.<segment>`, not `parent.<segment>` as
on BigQuery. Templates already know when the parent is itself a virtual
table (`parentPath` is non-empty in `instantiateNestedTables`), which is the
only signal needed to insert it.

### Rank 2 for comparison (fixture 1 and the chain)

```sql
FROM `cat`.`sch`.`transactions` AS `transactions`
LEFT OUTER JOIN LATERAL (
  SELECT pos AS `transactions__product__offset`, col.*
  FROM posexplode_outer(`transactions`.product)
) AS `transactions__product`
  ON TRUE
LEFT OUTER JOIN LATERAL (
  SELECT pos AS `transactions__product__variants__offset`, col.*
  FROM posexplode_outer(`transactions__product`.variants)
) AS `transactions__product__variants`
  ON TRUE
```

Leaves are then `` `transactions__product`.sku `` and
`` `transactions__product__variants`.size ``, identical to BigQuery. An array
of scalars needs `SELECT pos AS ..., col AS value`, so the scalar element is
`alias.value` rather than bare `alias`; the scalar shape differs from BigQuery
under either rank.

## Consequences for the compiler

- `getUnnestFromSql` gains a Databricks branch returning
  `` LATERAL posexplode_outer(<parent>.<seg>) AS `alias`(`alias__offset`, col) ``,
  with `<parent>.<seg>` becoming `<parent>.col.<seg>` when the parent is a
  virtual table. `getOffsetColumnSql` is unchanged if the position is aliased
  in the column list; otherwise it becomes `${TABLE}.pos` for this adapter.
- Leaf SQL on Databricks is `${TABLE}.col.<remainder>` instead of
  `defaultSql(remainder)`, and the scalar element is `${TABLE}.col` instead
  of `${TABLE}`. Both are per-adapter template choices in
  `getNestedTableTemplates` / `instantiateNestedTables`; the alternative that
  avoids them is rank 2's subquery, at the price of the DBR 13.0 floor and
  the extra decorrelation.
- Join order already satisfies the correlation rule: templates are emitted
  outermost first so a child's join follows its parent's, and every parent
  the argument references is a preceding `table_reference`.
- The `NotSupportedError` message in `getUnnestFromSql` names BigQuery as the
  only supported adapter and needs rewording when Databricks lands.

## Needs live check

Facts below could not be confirmed from a primary source, or are confirmed
only for Apache Spark rather than for Databricks SQL warehouses. A follow-up
ticket verifies them on a real workspace.

1. `` AS `alias`(`alias__offset`, col) `` with backtick-quoted alias and
   column identifiers parses and the bare `` `alias__offset` `` reference
   resolves in the outer SELECT, GROUP BY and ORDER BY.
2. `posexplode_outer` on an empty array yields one all-NULL row on a
   Databricks SQL warehouse (confirmed upstream in Spark's suite; the
   Databricks page states only the `NULL` case).
3. Chained correlation onto a struct path inside a previous lateral TVF
   alias (`` posexplode_outer(`parent`.col.variants) ``); the documented
   example correlates on a scalar `p1.col`.
4. Bare `${TABLE}` for a scalar element fails (expected) and the exact error
   condition, so the compiler can be tested against it.
5. Rank 2's correlated generator inside a lateral subquery runs on Databricks
   SQL and on DBR 13.0+; and whether it runs on DBR 12.2 LTS despite
   SPARK-41441 being absent from those notes.
6. Plan shape: whether Databricks rewrites `LEFT OUTER JOIN LATERAL
   posexplode_outer(...)` into a single `Generate` node (as `LATERAL VIEW`
   did) or plans a lateral join, and the cost of two chained unnests over a
   wide fact table.
7. Whether Databricks SQL Serverless and the Pro/Classic warehouse channels
   all accept the lateral TVF form today; the docs badge it "Databricks SQL"
   without a channel qualifier.

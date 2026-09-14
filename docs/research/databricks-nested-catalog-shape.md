# Databricks nested catalog shape research

Research date: 2026-09-14. Ticket: PROD-11230.

Question: for every column of a Databricks table, the translator needs the
dotted sub-paths and whether each node is repeated (array) and/or a record
(struct), the way `flattenSchemaFields` and `setCatalogNestedColumnShape`
fill it for BigQuery from the table schema's `mode` and `fields`
(`packages/warehouses/src/warehouseClients/BigqueryWarehouseClient.ts`,
`WarehouseNestedColumnShape` in `packages/common/src/types/warehouse.ts`).
Which Databricks metadata source gives that on a SQL warehouse, and what has
to be parsed?

Sources were pinned at these revisions:

- `apache/spark`: [`07d92669ccd2c873bb5fca7aa1aaee7c463e6d70`](https://github.com/apache/spark/tree/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70)
- `databricks/databricks-sql-nodejs`: [`b227e3aa759aaedc04801328813435bc04e96f80`](https://github.com/databricks/databricks-sql-nodejs/tree/b227e3aa759aaedc04801328813435bc04e96f80)
- `databricks/databricks-sql-python`: [`696e78054f250282b3c930199ed71a4bb4e68fe8`](https://github.com/databricks/databricks-sql-python/tree/696e78054f250282b3c930199ed71a4bb4e68fe8)
- `@databricks/sql` as installed: `1.13.0` (`packages/warehouses/package.json`)
- Databricks SQL reference at docs.databricks.com (AWS edition), fetched on the
  research date

Databricks' SQL warehouse server is closed source. Where a fact depends on
what the server returns rather than on published documentation or the open
driver, it is marked **needs live check**; a later ticket verifies on a real
workspace.

## Conclusion

No Databricks source hands over a per-field `mode`/`fields` tree the way the
BigQuery table schema does. The shape has to come from one of two things: a
type string in Spark DDL syntax (`ARRAY<STRUCT<sku: STRING, price: DOUBLE>>`)
that we parse, or the JSON document returned by
`DESCRIBE TABLE EXTENDED ... AS JSON`, which already has the tree. Ranked:

1. **`DESCRIBE TABLE EXTENDED <table> AS JSON`** — a structured tree with raw
   field names, nullability and comments; parsing cost is `JSON.parse` plus a
   ~30-line recursive walk. One statement per table, the same round-trip count
   as today's `getColumns`. Available on Databricks SQL (all warehouse types,
   serverless included) and Databricks Runtime 16.2+; not available on
   all-purpose clusters below 16.2. Works for `hive_metastore` tables.
2. **`session.getColumns()` → `TYPE_NAME`** — already fetched by `getCatalog`,
   zero new round trips. Evidence says it carries the full type string in
   Spark's `DataType.sql` form (upper-case keywords, backquoted names where
   needed, `NOT NULL`/`COMMENT` retained, never truncated). Needs a
   ~100-line recursive-descent parser over the DDL grammar below, and the
   exact rendering on a Databricks warehouse **needs live check**.
3. **`information_schema.columns.full_data_type`** — same DDL string parser,
   and one query can cover a whole schema. Unity Catalog only (no
   `hive_metastore`), and whether names are backquoted in this column is
   unconfirmed (**needs live check**); an unquoted rendering makes field names
   with spaces or colons ambiguous.
4. **Plain `DESCRIBE TABLE [EXTENDED]`** — the `data_type` column is Spark's
   `simpleString`: lower-case, unquoted field names, and truncated to
   `spark.sql.debug.maxToStringFields` (default 25) with a
   `... N more fields` placeholder. Reject.

All four run on a serverless SQL warehouse with the privileges a Lightdash
service principal already holds for querying the tables it models; none needs
extra grants. Whether `DESCRIBE TABLE` succeeds with `BROWSE` alone (no
`SELECT`) is not stated in the docs (**needs live check**, low importance).

Recommendation: implement option 1 for `getCatalog` and `getFields`, and
decide with one internal data check whether option 2 is needed as well —
count Databricks connections whose `httpPath` points at an all-purpose
cluster (`sql/protocolv1/o/...`) rather than a SQL warehouse
(`/sql/1.0/warehouses/...`). If that population is empty or negligible, the
DDL parser is not needed. If it is not, option 2 alone (with its parser) is
the single code path that works everywhere.

## What the translator needs

`WarehouseNestedColumnShape` is `{ repeated: boolean; record: boolean }`
keyed by dotted column path, stored in the `__lightdashNestedColumns` sidecar
of the catalog (`packages/common/src/types/warehouse.ts`). BigQuery's
`flattenSchemaFields` emits the container node and all descendants, with
`repeated = mode === 'REPEATED'` and `record = type in (RECORD, STRUCT)`
(`packages/warehouses/src/warehouseClients/BigqueryWarehouseClient.ts`).

On Databricks the same information is encoded positionally in the type:

| Databricks type at a path | `repeated` | `record` | Children |
| --- | --- | --- | --- |
| `STRUCT<...>` | false | true | one path per field |
| `ARRAY<STRUCT<...>>` | true | true | one path per struct field |
| `ARRAY<scalar>` | true | false | none |
| `ARRAY<ARRAY<T>>` | true | — | no BigQuery analogue; the boolean model loses one level |
| `MAP<K, V>` | false | false | none; keys are data, not schema |
| `VARIANT` | false | false | none; the shape is per value (`schema_of_variant`), not in the catalog |

A struct inside an array inside a struct, `order STRUCT<items: ARRAY<STRUCT<sku: STRING, price: DOUBLE>>>`,
yields `order` `{record}`, `order.items` `{repeated, record}`, and scalar
leaves `order.items.sku`, `order.items.price` — the same paths and shapes
BigQuery produces for a REPEATED RECORD inside a RECORD.

## Source 1: `session.getColumns()` (what `getCatalog` uses today)

`DatabricksWarehouseClient.getTableColumns` calls `session.getColumns({catalogName, schemaName, tableName})`
and reads `COLUMN_NAME` and `TYPE_NAME` from each row; `mapFieldType` then
applies `normaliseDatabricksType`, whose `/^[A-Z]+/` regex keeps only the
leading keyword, so `ARRAY<STRUCT<...>>` collapses to `ARRAY` → `STRING`
(`packages/warehouses/src/warehouseClients/DatabricksWarehouseClient.ts`).

The driver is a passthrough. `DBSQLSession.getColumns` builds a Thrift
`TGetColumnsReq` with the four name filters and `runAsync`
(`dist/DBSQLSession.js` lines 398–412 in the installed 1.13.0;
[`lib/DBSQLSession.ts`](https://github.com/databricks/databricks-sql-nodejs/blob/b227e3aa759aaedc04801328813435bc04e96f80/lib/DBSQLSession.ts)),
and `GetColumnsCommand` sends it to the Thrift `GetColumns` operation
(`dist/hive/Commands/GetColumnsCommand.js`). The request type is
[`ColumnsRequest`](https://github.com/databricks/databricks-sql-nodejs/blob/b227e3aa759aaedc04801328813435bc04e96f80/lib/contracts/IDBSQLSession.ts):
`catalogName?`, `schemaName?`, `tableName?`, `columnName?`, `maxRows?`.
Result rows are objects keyed by the result-set column names
(`JsonResultHandler.getRows`, `dist/result/JsonResultHandler.js`), so
`TYPE_NAME` arrives exactly as the server sent it; nothing in the driver
inspects or rewrites it. The driver's own e2e suite never calls
`getColumns` — `tests/e2e/data_types.test.ts` reads column metadata with
`DESCRIBE` instead
([source](https://github.com/databricks/databricks-sql-nodejs/blob/b227e3aa759aaedc04801328813435bc04e96f80/tests/e2e/data_types.test.ts)).

What the server puts in `TYPE_NAME`:

- The Databricks Python driver's e2e test `test_get_columns`, which runs
  against a real SQL warehouse, creates a table with
  `named_struct('name', 'alice', 'age', 28) as col_3, map('items', 45, 'cost', 228) as col_4, array('item1', 'item2', 'item3') as col_5`
  and expects `TYPE_NAME` values `"STRUCT<name: STRING, age: INT>"`,
  `"MAP<STRING, INT>"` and `"ARRAY<STRING>"`, one row per top-level column and
  no extra rows for struct fields
  ([`tests/e2e/test_driver.py`](https://github.com/databricks/databricks-sql-python/blob/696e78054f250282b3c930199ed71a4bb4e68fe8/tests/e2e/test_driver.py)).
  The Python and Node drivers speak the same Thrift protocol to the same
  server, so this is the best available evidence for what Node receives.
- That rendering is Spark's `DataType.sql`: `StructType.sql` is
  `s"STRUCT<${fields.map(_.sql).mkString(", ")}>"`
  ([StructType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/StructType.scala)),
  `StructField.sql` is
  `s"${QuotingUtils.quoteIfNeeded(name)}: ${dataType.sql}$nullDDL$getDDLComment"`
  ([StructField.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/StructField.scala)),
  `ArrayType.sql` is `"ARRAY<${elementType.sql}>"`
  ([ArrayType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/ArrayType.scala)),
  `MapType.sql` is `s"MAP<${keyType.sql}, ${valueType.sql}>"`
  ([MapType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/MapType.scala)).
  Open-source Spark's Thrift server populates `TYPE_NAME` from
  `column.dataType.sql`
  ([SparkGetColumnsOperation.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/hive-thriftserver/src/main/scala/org/apache/spark/sql/hive/thriftserver/SparkGetColumnsOperation.scala))
  and does not flatten struct fields into rows.
- `sql` is not truncated (unlike `simpleString`, below), so a wide struct
  arrives whole.

**Needs live check**: that Databricks' server also emits `NOT NULL` and
`COMMENT '...'` inside struct fields in `TYPE_NAME` (Spark's `StructField.sql`
does), and that field names needing quotes arrive backquoted. The Python e2e
fixture only covers plain names without constraints or comments.

## Source 2: `information_schema.columns` (what `getFields` uses today)

`getFields` selects `data_type` from `information_schema.columns` filtered by
table name and optionally schema/catalog
(`packages/warehouses/src/warehouseClients/DatabricksWarehouseClient.ts`).

The docs define the two type columns as
([COLUMNS](https://docs.databricks.com/aws/en/sql/language-manual/information-schema/columns)):

- `DATA_TYPE`: "The simple data type name of the column, or `STRUCT`, or
  `ARRAY`." The docs do not say what appears for `MAP` (**needs live check**).
- `FULL_DATA_TYPE`: "The data type as specified in the column definition."

Supporting columns for scalars: `NUMERIC_PRECISION`/`NUMERIC_SCALE` (digits
for `DECIMAL`), `DATETIME_PRECISION`, `INTERVAL_TYPE` ("the unit portion of
the interval, e.g. `'YEAR TO MONTH'`"), `IS_NULLABLE`, `COMMENT`. None of
these describe nested fields; only `FULL_DATA_TYPE` carries the tree, as a
string.

Scope and permissions ([Information schema](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-information-schema)):
"Applies to: Databricks SQL, Databricks Runtime 10.4 LTS and above, Unity
Catalog only." `system.information_schema` "does not contain metadata about
`hive_metastore` objects"; each Unity Catalog catalog also has its own
`information_schema` covering that catalog. "Both types of information
schemas automatically filter results to include only the objects you have
Unity Catalog privileges to access", and "the information schema does not
require an explicit `SELECT` grant."

**Needs live check**: the exact rendering of `FULL_DATA_TYPE` for nested
types. The docs' only example shows scalar `STRING` upper-case. Two Spark
renderings exist and the same grammar parses both, but they differ in one
way that matters: `DataType.sql` backquotes names that fail
`^[a-zA-Z_][a-zA-Z0-9_]*`
([QuotingUtils.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/catalyst/util/QuotingUtils.scala)),
whereas `catalogString` renders `struct<name:type,...>` with raw, unquoted
names and no spaces
([StructType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/StructType.scala)).
If `FULL_DATA_TYPE` is `catalogString`-shaped, a field named `unit price` or
`a:b` cannot be tokenised unambiguously. The live check must include a struct
field whose name contains a space, a colon and a backtick.

## Source 3: `DESCRIBE TABLE`

Syntax ([DESCRIBE TABLE](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-aux-describe-table)):
`{ DESC | DESCRIBE } [ TABLE ] [ EXTENDED ] table_name { [ PARTITION clause ] | [ column_name ] } [ AS JSON ]`.
The `column_name` form does not accept nested paths: "Currently nested columns
are not allowed to be specified." Spark enforces this with
`DESC TABLE COLUMN does not support nested column: col.x`
([DescribeTableSuiteBase.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/test/scala/org/apache/spark/sql/execution/command/DescribeTableSuiteBase.scala)).

### Human-readable form (`DESCRIBE TABLE`, `DESCRIBE TABLE EXTENDED`)

One row per top-level column with `col_name`, `data_type`, `comment`; the
Databricks example shows lower-case `int`, `string`. Spark builds
`data_type` from `column.dataType.simpleString` in both the v1 command
(`append(buffer, column.name, column.dataType.simpleString, column.getComment().orNull)`,
[tables.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/main/scala/org/apache/spark/sql/execution/command/tables.scala))
and the v2 exec
(`toCatalystRow(column.name, column.dataType.simpleString, column.comment)`,
[DescribeTableExec.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/main/scala/org/apache/spark/sql/execution/datasources/v2/DescribeTableExec.scala)).
Spark's own test expects `struct<x:int,y:string>` for a column declared
`struct<x:int, y:string>`. `StructType.simpleString` passes the fields through
`SparkStringUtils.truncatedString(fieldTypes, "struct<", ",", ">", SqlApiConf.get.maxToStringFields)`
([StructType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/StructType.scala));
`spark.sql.debug.maxToStringFields` defaults to 25 and "Any elements beyond
the limit will be dropped and replaced by a `"... N more fields"` placeholder"
([SQLConf.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/catalyst/src/main/scala/org/apache/spark/sql/internal/SQLConf.scala)).
Truncation plus unquoted names disqualify this form for schema extraction.
The effective limit on a Databricks warehouse is unknown (**needs live
check**, only relevant if this form were ever used).

### JSON form (`DESCRIBE TABLE EXTENDED ... AS JSON`)

Availability: the Databricks page marks `AS JSON` as "Databricks SQL,
Databricks Runtime 16.2 and above" and states "Only supported when `EXTENDED`
format is specified." The Databricks SQL 2025.10 release note (Preview
channel from 2025-02-21) announces "You can now use the `DESCRIBE TABLE AS
JSON` command to return table metadata as a JSON document"
([Databricks SQL release notes 2025](https://docs.databricks.com/aws/en/sql/release-notes/2025)).
Channel releases are staged, Preview then Current; by the research date every
SQL warehouse on either channel is far past 2025.10. All-purpose clusters
pinned to a Databricks Runtime below 16.2 (for example 15.4 LTS) do not have
it — that is the compatibility boundary for this option.

Output: a single JSON string. Columns appear under `columns` as
`{"name", "type", "comment", "nullable", "default"}` objects, and `type` is a
recursive object. The Databricks page documents these type shapes:

| Type | JSON |
| --- | --- |
| scalar | `{ "name": "<typename>" }` |
| `DECIMAL(p,s)` | `{ "name": "decimal", "precision": p, "scale": s }` |
| `ARRAY<T>` | `{ "name": "array", "element_type": <type>, "element_nullable": <bool> }` |
| `MAP<K,V>` | `{ "name": "map", "key_type": <type>, "value_type": <type>, "element_nullable": <bool> }` |
| `STRUCT<...>` | `{ "name": "struct", "fields": [ { "name", "type", "nullable", "comment", "default" } ] }` |
| `INTERVAL` | `{ "name": "interval", "start_unit": "<unit>", "end_unit": "<unit>" }` |
| `CHAR(n)` / `VARCHAR(n)` | `{ "name": "char" \| "varchar", "length": n }` |
| `STRING` | `{ "name": "string", "collation": "<collation>" }` |
| `VARIANT` | `{ "name": "variant" }` |

Spark's implementation, which the Databricks docs mirror, is
`DescribeRelationJsonCommand.jsonType`
([source](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/core/src/main/scala/org/apache/spark/sql/execution/command/DescribeRelationJsonCommand.scala)):
struct fields are emitted with the raw `field.name` (no quoting or escaping to
undo), `TimestampType` is special-cased to `"timestamp_ltz"`, and every other
type falls through to `{"name": dataType.simpleString}` (so `TIMESTAMP_NTZ` →
`"timestamp_ntz"`, `VARIANT` → `"variant"`, `INT` → `"int"`). The top-level
`columns` array is produced by running `jsonType(StructType(schema.fields))`
and taking its `fields`, so top-level columns and nested struct fields have
an identical shape: one recursive function covers both. Two details differ
between the Databricks page and Spark: Spark names the map value flag
`value_nullable` while the Databricks table says `element_nullable`, and
Spark's docs list the same `value_nullable`
([Spark DESCRIBE TABLE](https://spark.apache.org/docs/latest/sql-ref-syntax-aux-describe-table.html));
the flag is irrelevant to shape extraction, but the discrepancy is noted.
The Databricks page adds `is_measure` to column objects for metric views.

The output column name that holds the JSON string is not named in either
docs page (**needs live check**; read the first cell of the first row).

Cost: `JSON.parse` in a try/catch (project rule), then a walk that emits
`{repeated: name === 'array', record: name === 'struct'}` per path and
recurses into `fields` and `element_type`. No grammar, no quoting rules, no
truncation. The payload also carries table-level metadata (`location`,
`table_properties`, statistics), a few kilobytes per table.

## The DDL type-string grammar (options 2 and 3)

`full_data_type` and `TYPE_NAME` follow the type grammar Spark uses for
`DataType.fromDDL`, which tries `DataTypeParser.parseDataType` (a single type)
and falls back to `parseTableSchema` (a comma-separated field list)
([DataType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/DataType.scala));
`StructType.fromDDL` is `DataTypeParser.parseTableSchema(ddl)`
([StructType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/StructType.scala)).
The rules, verbatim from
[SqlBaseParser.g4](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBaseParser.g4):

```antlr
dataType
    : complex=ARRAY (LT dataType GT)?
    | complex=MAP (LT dataType COMMA dataType GT)?
    | complex=STRUCT ((LT complexColTypeList? GT) | NEQ)?
    | primitiveType
    ;
complexColTypeList : complexColType (COMMA complexColType)* ;
complexColType
    : errorCapturingIdentifier COLON? dataType (errorCapturingNot NULL)? commentSpec?
    ;
colTypeList : colType (COMMA colType)* ;
colType
    : colName=errorCapturingIdentifier dataType (errorCapturingNot NULL)? commentSpec?
    ;
commentSpec : COMMENT stringLit ;
stringLit   : singleStringLit+ ;
primitiveType
    : nonTrivialPrimitiveType
    | trivialPrimitiveType
    | unsupportedType=identifier (LEFT_PAREN integerValue(COMMA integerValue)* RIGHT_PAREN)?
    ;
nonTrivialPrimitiveType
    : STRING collateClause?
    | (CHARACTER | CHAR) (LEFT_PAREN length=integerValue RIGHT_PAREN)? collateClause?
    | VARCHAR (LEFT_PAREN length=integerValue RIGHT_PAREN)? collateClause?
    | (DECIMAL | DEC | NUMERIC)
        (LEFT_PAREN precision=integerValue (COMMA scale=integerValue)? RIGHT_PAREN)?
    | INTERVAL
        (fromYearMonth=(YEAR | MONTH) (TO to=MONTH)? |
         fromDayTime=(DAY | HOUR | MINUTE | SECOND) (TO to=(HOUR | MINUTE | SECOND))?)?
    | TIMESTAMP (LEFT_PAREN precision=integerValue RIGHT_PAREN)?
        (withLocalTimeZone | withoutTimeZone)?
    | TIMESTAMP_LTZ (LEFT_PAREN precision=integerValue RIGHT_PAREN)?
    | TIMESTAMP_NTZ (LEFT_PAREN precision=integerValue RIGHT_PAREN)?
    | TIME (LEFT_PAREN precision=integerValue RIGHT_PAREN)? (withoutTimeZone)?
    | GEOGRAPHY LEFT_PAREN (srid=integerValue | any=ANY) RIGHT_PAREN
    | ...
    ;
trivialPrimitiveType
    : BOOLEAN | TINYINT | BYTE | SMALLINT | SHORT | INT | INTEGER | BIGINT | LONG
    | FLOAT | REAL | DOUBLE | DATE | BINARY | VOID | VARIANT
    ;
quotedIdentifier : BACKQUOTED_IDENTIFIER | {double_quoted_identifiers}? DOUBLEQUOTED_STRING ;
```

Lexer rules, verbatim from
[SqlBaseLexer.g4](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBaseLexer.g4):

```antlr
BACKQUOTED_IDENTIFIER : '`' ( ~'`' | '``' )* '`' ;
IDENTIFIER            : (UNICODE_LETTER | DIGIT | '_')+ | ... ;
STRING_LITERAL        : '\'' ( ~('\''|'\\') | ('\\' .) | ('\'' '\'') )* '\'' | 'R\'' (~'\'')* '\'' | 'R"'(~'"')* '"' ;
DOUBLEQUOTED_STRING   : '"' ( ~('"'|'\\') | '""' | ('\\' .) )* '"' ;
LT : '<' ;   GT : '>' {decComplexTypeLevelCounter();} ;   NEQ : '<>' ;
SHIFT_RIGHT : '>>' {isShiftRightOperator()}? ;
WS : [ \t\n\f\r   -    　]+ -> channel(HIDDEN) ;
```

What a Lightdash parser must therefore handle:

- **Keywords are case-insensitive.** Spark lexes through an
  `UpperCaseCharStream`
  ([parsers.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/catalyst/parser/parsers.scala)),
  so `struct<a:int>` and `STRUCT<a: INT>` are the same type. Databricks' own
  docs show both: `typeof` returns `struct<Field1:string,Field2:int>` and
  `array<int>` ([STRUCT type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/struct-type),
  [typeof](https://docs.databricks.com/aws/en/sql/language-manual/functions/typeof))
  but also `DECIMAL(10, 0)` and `MAP<TIMESTAMP, INT>`
  ([DECIMAL type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/decimal-type),
  [MAP type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/map-type)).
- **Whitespace is optional everywhere between tokens**, including around `:`,
  `,`, `<`, `>` and inside `DECIMAL( 10 , 2 )`. Spark's JSON regexes allow
  `\s*` around decimal parameters
  ([DataType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/DataType.scala)).
- **Nesting** is unbounded in the grammar: `dataType` is recursive with no
  depth cap, and the Databricks type pages state no limit ("The type supports
  any number of fields greater or equal to 0" for STRUCT; arrays "of any
  length"; a search of docs.databricks.com found no nesting-depth limit).
  Spark's lexer tracks `ARRAY`/`MAP`/`STRUCT` openings so that `>>` closing
  `MAP<INT, ARRAY<INT>>` lexes as two `GT` tokens rather than `SHIFT_RIGHT`; a
  hand-written tokenizer must likewise treat every `>` as a single close.
- **Struct with zero fields** prints as `STRUCT<>`, which the lexer sees as
  `STRUCT` `NEQ`; the grammar accepts it explicitly.
- **The colon after a field name is optional** (`COLON?`), and in the
  `parseTableSchema` fallback (top-level `colType`) there is no colon at all:
  `a INT, b STRING`.
- **Field names**: unquoted names are `(UNICODE_LETTER | DIGIT | '_')+`; a
  name is backquoted when it fails `^[a-zA-Z_][a-zA-Z0-9_]*` in
  `quoteIfNeeded`, and a backtick inside a name is doubled (`` `a``b` ``)
  ([QuotingUtils.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/catalyst/util/QuotingUtils.scala)).
  Spaces, commas, `:`, `<`, `>` and dots can all appear inside backticks
  (`` `unit price` ``, `` `a.b` ``). Column names with spaces or any of
  `,;{}()\n\t=` exist only on Delta tables with `delta.columnMapping.mode`
  set to `name` or `id`
  ([Column mapping](https://docs.databricks.com/aws/en/delta/column-mapping)).
  STRUCT field names "need not be unique"
  ([STRUCT type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/struct-type)),
  so two sibling fields can produce the same dotted path; a backquoted name
  containing a dot also collides with a genuinely nested path — both are
  edge cases the sidecar's flat dotted-path key cannot represent.
- **`NOT NULL`** may follow any field type (`NOT` may also be `!`), and
  `StructField.sql` emits it whenever `nullable` is false.
- **`COMMENT 'text'`** may follow `NOT NULL`. The string is single-quoted
  (double-quoted also lexes), backslash-escaped (`\'`, `\\`), and a quote may
  also be doubled (`''`); `stringLit` is `singleStringLit+`, so two adjacent
  literals concatenate. Spark writes comments with
  `escapeSingleQuotedString`, which emits `\\` for `\` and `\'` for `'`
  ([QuotingUtils.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/catalyst/util/QuotingUtils.scala)).
  Comment text can contain `,`, `<`, `>` and `:`, so the tokenizer must
  consume string literals before any delimiter logic runs — never split the
  type string on commas or angle brackets.
- **`COLLATE name`** may follow `STRING`, `CHAR(n)`, `VARCHAR(n)`; Databricks
  documents it in the STRUCT field position
  (`fieldType [NOT NULL] [COLLATE collationName] [COMMENT str]`), which is
  the same textual position. `StringType.typeName` renders a non-default
  collation as `string collate UTF8_LCASE`
  ([StringType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/StringType.scala)).
- **`MAP<K, V>`**: exactly two types; `keyType` is "Any data type other than
  MAP" ([MAP type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/map-type)),
  so a struct key (`MAP<STRUCT<w1:string, w2:string>, string>`) is legal and
  the key type must be parsed recursively, then discarded for shape purposes.
- **`DECIMAL(p,s)`**: `{ DECIMAL | DEC | NUMERIC } [ ( p [ , s ] ) ]`, defaults
  `p=10`, `s=0`, `1 <= p <= 38`
  ([DECIMAL type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/decimal-type));
  `DecimalType.sql` is `DECIMAL(p,s)` without a space
  ([DecimalType.scala](https://github.com/apache/spark/blob/07d92669ccd2c873bb5fca7aa1aaee7c463e6d70/sql/api/src/main/scala/org/apache/spark/sql/types/DecimalType.scala)),
  the docs' `typeof` example shows `DECIMAL(10, 0)` with one — accept both.
- **`TIMESTAMP_NTZ`**: `TIMESTAMP WITHOUT TIME ZONE | TIMESTAMP_NTZ`, the
  spelled-out form on Runtime 17.1+
  ([TIMESTAMP_NTZ type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/timestamp-ntz-type));
  the grammar also admits `TIMESTAMP_LTZ`, `TIMESTAMP(p)` and
  `TIMESTAMP WITH LOCAL TIME ZONE`. The existing
  `getDatabricksTimestampDomain` strips a trailing `(...)` and matches
  `TIMESTAMP` / `TIMESTAMP_NTZ` by exact upper-case name; `TIMESTAMP_LTZ` and
  the spelled-out forms would fall through today.
- **`INTERVAL`**: `INTERVAL { YEAR [TO MONTH] | MONTH }` or
  `INTERVAL { DAY [TO { HOUR | MINUTE | SECOND }] | HOUR [TO { MINUTE | SECOND }] | MINUTE [TO SECOND] | SECOND }`
  ([INTERVAL type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/interval-type));
  bare `INTERVAL` is the legacy `CalendarIntervalType`. A multi-word type
  name, so a tokenizer cannot assume one word per primitive.
- **`VARIANT`**: a single keyword with no parameters; "Databricks SQL,
  Databricks Runtime 15.3 and above"
  ([VARIANT type](https://docs.databricks.com/aws/en/sql/language-manual/data-types/variant-type)).
  It carries no static shape.
- **Other parameterised primitives** that appear in the same grammar and must
  at least be skipped: `CHAR(n)`, `VARCHAR(n)`, `TIME(p)`,
  `GEOGRAPHY(srid|ANY)`, `GEOMETRY(...)`, and the catch-all
  `identifier ( int, ... )` that Spark rejects as unsupported. Aliases the
  grammar accepts and Databricks' `DatabricksTypes` enum already lists:
  `BYTE`, `SHORT`, `INTEGER`, `LONG`, `REAL`, `DEC`, `NUMERIC`.

A recursive-descent parser over this is small: a tokenizer for backquoted
identifiers, string literals, words, integers and the six punctuation
characters, then `parseType` with three container branches and a primitive
branch that swallows `( ... )` and the `INTERVAL ... TO ...`,
`TIMESTAMP ... TIME ZONE` and `COLLATE name` tails. Shape extraction only
needs the container structure and field names; every scalar can be kept as
its raw text for `mapFieldType` and `getDatabricksTimestampDomain`, which
already accept the leading keyword. The Spark test suite's DDL fixtures and
the grammar above give the unit-test corpus.

## Permissions and serverless

- `getColumns` is a Thrift metadata operation on the same session Lightdash
  already opens against the warehouse's `httpPath`; the Python driver's e2e
  suite exercises it against SQL warehouses. No documentation describes a
  separate privilege for it.
- `information_schema` requires no `SELECT` grant and self-filters to objects
  the principal can access (Unity Catalog only).
- `DESCRIBE TABLE` has no privileges section on its page. The Unity Catalog
  privileges reference says `BROWSE` lets a user "Discover objects, view their
  metadata, and request access to them without needing `USE CATALOG` or
  `USE SCHEMA`", and `SELECT` lets them query data
  ([Privilege types](https://docs.databricks.com/aws/en/data-governance/unity-catalog/manage-privileges/privileges));
  whether `DESCRIBE` is satisfied by `BROWSE` alone **needs live check**. For
  Lightdash it is moot: the principal already has `SELECT` on anything it
  models.
- Every option is marked "Applies to: Databricks SQL" and so runs on
  serverless, pro and classic SQL warehouses alike. The single version gate is
  `AS JSON` on all-purpose clusters below Databricks Runtime 16.2.

## Needs live check (for the follow-up ticket)

1. `TYPE_NAME` from `getColumns` on a Databricks SQL warehouse for a column
   declared as

   ```sql
   STRUCT<`unit price`: DECIMAL(10,2) NOT NULL COMMENT 'it''s > 0, <b>',
          items: ARRAY<STRUCT<sku: STRING, tags: MAP<STRING, INT>>>,
          v: VARIANT, ts: TIMESTAMP_NTZ, iv: INTERVAL DAY TO SECOND>
   ```

   confirm upper-case `.sql` rendering, backquoting, `NOT NULL`, `COMMENT`
   with escapes, and no truncation past 25 fields.
2. `information_schema.columns.full_data_type` and `data_type` for the same
   column (and for a top-level `MAP` column): case, quoting of the field name
   with a space, and whether `data_type` says `MAP`.
3. `DESCRIBE TABLE EXTENDED ... AS JSON` on a serverless warehouse: the output
   column name, the nested `type` object for the column above, the map flag
   name (`value_nullable` vs `element_nullable`), and behaviour on a
   `hive_metastore` table and on a view.
4. Whether any production Databricks connection uses a cluster `httpPath`
   below Runtime 16.2 (an internal data check, not a workspace check).
5. Whether `DESCRIBE TABLE` succeeds with `BROWSE` but not `SELECT` (low
   importance).

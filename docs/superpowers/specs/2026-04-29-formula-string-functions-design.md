# Formula String Functions

## Why

The formula DSL is sold as "Google Sheets-like" but ships only six string ops (`CONCAT`, `LEN`, `LENGTH`, `TRIM`, `LOWER`, `UPPER`). Users routinely need substring extraction and string replacement (e.g. "remove the leading `https://` off this domain column"). Today the AI formula generator emits `REPLACE(...)` or `MID(...)` and the parser rejects it; the agent retries once and fails. The user gets "Failed to generate a valid formula. Please try rephrasing your request" — but no rephrasing helps because the operations don't exist.

## What

Add four functions to `packages/formula`:

| Function | Arity | SQL emission (default) | Per-dialect overrides |
| --- | --- | --- | --- |
| `REPLACE(text, search, replace)` | 3 | `REPLACE(t, s, r)` | none — native everywhere |
| `SUBSTRING(text, start, length)` | 3 | `SUBSTRING(t, s, l)` | BigQuery → `SUBSTR(t, s, l)` |
| `LEFT(text, count)` | 2 | `LEFT(t, n)` | none — native everywhere |
| `RIGHT(text, count)` | 2 | `RIGHT(t, n)` | none — native everywhere |

`SUBSTRING` is **strict 3-arg** (no 2-arg "rest of string" form). Users who want that compose with `LEN`. Avoids introducing a new `TwoOrThreeArgFn` AST shape for one case.

No alias for `SUBSTRING` (no `MID`). One name per concept.

## How

The package already has bucketed AST node types per arity (`SingleArgFnNode`, `OneOrTwoArgFnNode`, `VariadicFnNode`, etc.). The two new arities need two new buckets — same shape as the existing ones, no architectural change.

### 1. `functions.ts`

Add two arity buckets and wire them through:

```ts
export const TWO_ARG_FNS = ['LEFT', 'RIGHT'] as const;
export const THREE_ARG_FNS = ['REPLACE', 'SUBSTRING'] as const;

export type TwoArgFnName = (typeof TWO_ARG_FNS)[number];
export type ThreeArgFnName = (typeof THREE_ARG_FNS)[number];
```

Add to `ALL_FUNCTION_NAMES`, `FUNCTION_DEFINITIONS` (category `'string'`), and `getParserOptions()` (new keys `twoArgFns`, `threeArgFns`). The compile-time `_AssertAllFunctionsDefined` check picks up missing definitions automatically.

### 2. `types.ts`

Add two AST node types mirroring the existing pattern:

```ts
export interface TwoArgFnNode {
    type: 'TwoArgFn';
    name: TwoArgFnName;
    args: [ASTNode, ASTNode];
}

export interface ThreeArgFnNode {
    type: 'ThreeArgFn';
    name: ThreeArgFnName;
    args: [ASTNode, ASTNode, ASTNode];
}
```

Add both to the `ASTNode` union.

### 3. `ast.ts`

`isAggregateCall` returns `false` for both new node types (none are aggregates). `extractColumnRefs` flat-maps `args` like `OneOrTwoArgFn`/`VariadicFn` already do.

### 4. Grammar (`formula.pegjs`)

Add two rules in the `Primary` chain (after `OneOrTwoArgFn`, before `ZeroOrOneArgFn`):

```pegjs
TwoArgFn
  = name:Identifier &{ return twoArgFns.includes(name.toUpperCase()); }
    _ "(" _ first:Expression _ "," _ second:Expression _ ")" {
      return { type: "TwoArgFn", name: name.toUpperCase(), args: [first, second] };
    }

ThreeArgFn
  = name:Identifier &{ return threeArgFns.includes(name.toUpperCase()); }
    _ "(" _ first:Expression _ "," _ second:Expression _ "," _ third:Expression _ ")" {
      return { type: "ThreeArgFn", name: name.toUpperCase(), args: [first, second, third] };
    }
```

Wrong-arg-count cases already fall through to `InvalidFn`'s catch-all "called with wrong number of arguments" error — no new error rules needed.

Rebuild: `pnpm formula:build` runs `peggy` and produces `parser.js`.

### 5. Codegen (`generator.ts`)

Two new switch dispatchers:

```ts
protected generateTwoArgFn(node: TwoArgFnNode): string {
    const [a, b] = node.args.map((x) => this.generate(x));
    switch (node.name) {
        case 'LEFT':  return `LEFT(${a}, ${b})`;
        case 'RIGHT': return `RIGHT(${a}, ${b})`;
        default: return assertUnreachable(node.name, ...);
    }
}

protected generateThreeArgFn(node: ThreeArgFnNode): string {
    const [a, b, c] = node.args.map((x) => this.generate(x));
    switch (node.name) {
        case 'REPLACE':   return `REPLACE(${a}, ${b}, ${c})`;
        case 'SUBSTRING': return this.generateSubstring(a, b, c);
        default: return assertUnreachable(node.name, ...);
    }
}

protected generateSubstring(text, start, length): string {
    return this.dialect.generateSubstring?.(text, start, length)
        ?? `SUBSTRING(${text}, ${start}, ${length})`;
}
```

### 6. `dialects.ts`

Add one optional emitter to `DialectConfig`:

```ts
generateSubstring?: (text: string, start: string, length: string) => string;
```

BigQuery override:

```ts
const BIGQUERY_CONFIG: DialectConfig = {
    // ... existing ...
    generateSubstring: (text, start, length) => `SUBSTR(${text}, ${start}, ${length})`,
};
```

All other dialects use the ANSI default. Spot-checked:

- **Postgres / Redshift**: `SUBSTRING(string FROM start FOR length)` is the SQL-standard form, but the function-call form `SUBSTRING(string, start, length)` works too on both.
- **Snowflake**: `SUBSTRING` is native; `SUBSTR` is an alias.
- **DuckDB**: `SUBSTRING(string, start, length)` works.
- **Databricks (Spark SQL)**: `SUBSTRING` is native.
- **ClickHouse**: `substring(s, offset, length)` is native.
- **Trino / Athena**: `SUBSTRING(string, start, length)` is native (also supports `FROM…FOR…` form).
- **BigQuery**: `SUBSTRING` does not exist → use `SUBSTR`. (One override.)

### 7. Tests (`packages/formula/tests/`)

`grammar.test.ts`:
- Parse `=REPLACE(a, "x", "y")`, `=SUBSTRING(a, 1, 3)`, `=LEFT(a, 5)`, `=RIGHT(a, 5)` — assert AST shape.
- Wrong arg count → expect `"called with wrong number of arguments"` error.
- Nested usage: `=REPLACE(LOWER(a), "x", "y")`.

`codegen.test.ts`:
- Per-dialect emission for each function. Postgres-family + BigQuery `SUBSTR` divergence are the load-bearing cases; the other dialects share the default emitter so one happy-path assertion each is enough.

`packages/formula-tests/` is **not touched** — the user owns that follow-up.

## Out of scope

- `SUBSTITUTE` (Google Sheets name for `REPLACE`) — `REPLACE` already covers it.
- `FIND` / `POSITION`, `SPLIT`, `REGEX_REPLACE` — bigger surface, dialect divergence; defer to follow-ups.
- `MID` alias for `SUBSTRING` — pick one name.
- Updating `packages/formula-tests/` integration tests — explicitly the user's follow-up.

## Risk

- Grammar ordering: new rules must sit after `OneOrTwoArgFn` so existing function names keep matching their original buckets, but they don't actually overlap (different `Identifier` allow-lists). Adding them anywhere in `Primary` works; placing them adjacent to similar rules keeps the file readable.
- BigQuery `SUBSTR`: easy to forget. Covered by per-dialect codegen test.

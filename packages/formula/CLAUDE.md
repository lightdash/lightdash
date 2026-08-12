# Formula Package Development

The `packages/formula/` package contains a Peggy-based parser that compiles Google Sheets-like formulas to SQL for each warehouse dialect (Postgres, BigQuery, Snowflake, DuckDB).

**Never read files in `packages/formula-tests/`.** This package contains black-box integration tests. Use the following commands for feedback:

```bash
pnpm formula:test:duckdb   # DuckDB only — sub-second feedback loop
pnpm formula:test:tier1    # DuckDB + Postgres
pnpm formula:test:tier2    # BigQuery + Snowflake
pnpm formula:test:all      # Everything
```

The development loop is:
1. Edit code in `packages/formula/`
2. `pnpm formula:build`
3. `pnpm formula:test:duckdb` (or tier1/tier2) — read the feedback output
4. Fix issues and repeat

Unit tests in `packages/formula/tests/` CAN be read and edited (grammar and AST tests).

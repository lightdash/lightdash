---
paths:
  - packages/common/src/dbt/schemas/**
  - packages/common/src/schemas/json/**
  - packages/common/src/types/field.ts
---

# dbt YAML Validation Schemas

There are **two** JSON schemas that define valid Lightdash metadata in dbt YAML files. They must stay in sync:

| Schema | Path | Used by |
|--------|------|---------|
| `lightdashMetadata.json` | `packages/common/src/dbt/schemas/lightdashMetadata.json` | Compile-time validation (`exploreCompiler`) |
| `lightdash-dbt-2.0.json` | `packages/common/src/schemas/json/lightdash-dbt-2.0.json` | CLI `lightdash generate` (`DbtSchemaEditor`) |

**When adding or modifying field types (metric types, dimension types, additional dimension types), you MUST update both schemas.** The `lightdash-dbt-2.0.json` schema has two copies of the metric enum — one under `$defs/modelMeta` (model-level metrics) and one under `$defs/columnMeta` (column-level metrics). Both must be updated.

The canonical source of truth for field types is `packages/common/src/types/field.ts` (e.g., `MetricType` enum).

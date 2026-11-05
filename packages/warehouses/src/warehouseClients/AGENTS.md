# Warehouse clients

## Native types sidecar

`DimensionType` collapses distinct warehouse types: BigQuery `DATETIME`, `TIMESTAMP` and `TIME` all become `timestamp`. Where the difference changes the SQL an agent writes, `getFields` records the native type with `setCatalogNativeType` (`packages/common/src/types/warehouse.ts`), and the agent's `describeWarehouseTable` shows it as `timestamp (DATETIME)`.

- Record it in `getFields` only. `getCatalog` results are cached per project in `cached_warehouse`, so a per-column sidecar there grows every cache.
- Keep it sparse: only the types `DimensionType` collapses. BigQuery records whatever maps to `DimensionType.TIMESTAMP`.
- Store the type exactly as the warehouse reports it (`DATETIME`, `TIMESTAMP_NTZ`).
- Leave `DimensionType` mappings as they are; compile, filters and results depend on them app-wide.

To add a warehouse: call `setCatalogNativeType` in its `getFields` for the collapsed types, and test that `getFields` output via `getCatalogTableNativeTypes`. The backend needs no change: `ProjectService.getWarehouseFields` and the agent tool already pass the sidecar through.

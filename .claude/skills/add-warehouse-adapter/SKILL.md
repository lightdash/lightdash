# Add a Warehouse Adapter

Step-by-step checklist for adding a new warehouse connection to Lightdash. Follow the Athena adapter as the canonical example (PRs #19751/#19752). The MotherDuck/DuckDB adapter is the most recent implementation.

## Layer 1: Common Types (`packages/common/`)

- [ ] Add entry to `WarehouseTypes` enum in `src/types/projects.ts`
- [ ] Define `CreateXxxCredentials` type with `type: WarehouseTypes.XXX` discriminant
  - Sensitive fields (tokens, passwords, keys) should be optional (`token?: string`) — not required with empty-string sentinel
- [ ] Define `XxxCredentials = Omit<CreateXxxCredentials, SensitiveCredentialsFieldNames>`
- [ ] Add sensitive fields to `sensitiveCredentialsFieldNames` array if not already present (tokens, passwords, keys)
- [ ] Add `CreateXxxCredentials` to `CreateWarehouseCredentials` union
- [ ] Add `XxxCredentials` to `WarehouseCredentials` union
- [ ] Update `UserWarehouseCredentials` union in `src/types/userWarehouseCredentials.ts`
- [ ] Update `UserWarehouseCredentialsWithSecrets` union
- [ ] Add case to `getFieldQuoteChar()` in `src/utils/warehouse.ts`
- [ ] Verify `getAggregatedField()` in `src/utils/warehouse.ts` handles the new adapter (may fall into existing case)
- [ ] Check `src/utils/timeFrames.ts` adapter config map has the new adapter
- [ ] Check `src/compiler/translator.ts` `convertTimezone()` has the new adapter
- [ ] Run: `pnpm -F common typecheck && pnpm -F common lint`

## Layer 2: Backend (`packages/backend/`)

### Database Migration
- [ ] Create migration: `pnpm -F backend create-migration add_xxx_warehouse_type`
- [ ] `up`: Insert `{ warehouse_type: 'xxx' }` into `warehouse_types`
- [ ] `down`: Delete xxx credentials and type

### Entity & Profile
- [ ] Add `'xxx'` to `warehouseTypes` array in `src/database/entities/warehouseCredentials.ts`
- [ ] Add case to `credentialsTarget()` in `src/dbt/profiles.ts` (before `default`)
  - Pass secrets via `envVarReference()`/`envVar()` pattern (not raw env var names or inline values)
  - Follow ClickHouse pattern: `password: envVarReference('password')` in target, `[envVar('password')]: credentials.password` in environment
- [ ] Verify `quoteChars` in `src/dbt/DbtMetadataApiClient.ts` has the adapter

### Service Updates (exhaustive switch statements)
- [ ] `src/services/ProjectService/ProjectService.ts` - `clearSecretsFromCredentials()`
  - Blank sensitive fields (`token: undefined`) instead of destructuring + unsafe `as` cast
  - Follow the same pattern as other warehouses (`{ ...credentials, password: '' }`)
- [ ] `src/services/ProjectService/ProjectService.ts` - warehouse client creation switch
- [ ] `src/services/ProjectService/ProjectService.ts` - user credentials creation switch
- [ ] `src/services/ProjectService/ProjectService.ts` - `getDatabaseFromWarehouseCredentials()`
- [ ] `src/models/UserWarehouseCredentials/UserWarehouseCredentialsModel.ts`
- [ ] Run: `pnpm -F backend typecheck && pnpm -F backend lint`

## Layer 3: Warehouse Client (`packages/warehouses/`)

- [ ] Create `src/warehouseClients/XxxWarehouseClient.ts`
  - Extend `WarehouseBaseClient<CreateXxxCredentials>`
  - Implement `XxxSqlBuilder extends WarehouseBaseSqlBuilder`
  - Implement: `streamQuery()`, `getCatalog()`, `getAllTables()`, `getFields()` (inherited `test()`, `runQuery()`, `executeAsyncQuery()` work via base class — don't add no-op overrides)
  - Pass credentials directly to client library (like ClickHouse/Databricks), never via `process.env`
  - Use constructor `overrides` param for alternate construction (e.g. pre-aggregate) instead of `AnyType` casts on readonly fields
- [ ] Add case in `src/warehouseClientFromCredentials.ts` factory
- [ ] Add case in `src/ssh/sshTunnel.ts` (typically a no-op `break` for cloud warehouses)
- [ ] Export from `src/index.ts`
- [ ] Write tests in `src/warehouseClients/XxxWarehouseClient.test.ts`
- [ ] Run: `pnpm -F @lightdash/warehouses typecheck && pnpm -F @lightdash/warehouses test`

## Layer 4: Frontend (`packages/frontend/`)

### Warehouse Form
- [ ] Create `src/components/ProjectConnection/WarehouseForms/XxxForm.tsx`
  - Follow `AthenaForm.tsx` pattern with Mantine v8 components
  - Export `XxxSchemaInput` for `DbtSettingsForm`
- [ ] Add SVG logo to `src/components/ProjectConnection/ProjectConnectFlow/Assets/`

### Registration
- [ ] Add defaults to `WarehouseForms/defaultValues.ts` (`XxxDefaultValues` + add to `warehouseDefaultValues`)
- [ ] Add validators to `WarehouseForms/validators.ts`
- [ ] Register in `WarehouseSettingsForm.tsx` (labels + forms maps)
- [ ] Register in `DbtSettingsForm.tsx` (schema input switch)
- [ ] Register in `ProjectConnectFlow/utils.tsx` (WarehouseTypeLabels array)
- [ ] Register in `UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal.tsx` (defaultCredentials)
- [ ] Register in `UserSettings/MyWarehouseConnectionsPanel/EditCredentialsModal.tsx` (getCredentialsWithPlaceholders)
- [ ] Register in `UserSettings/MyWarehouseConnectionsPanel/WarehouseFormInputs.tsx`
- [ ] Run: `pnpm -F frontend typecheck && pnpm -F frontend lint`

## Layer 5: CLI (`packages/cli/`)

- [ ] Create `src/dbt/targets/xxx.ts`
  - Define `XxxTarget` type matching dbt profile structure
  - Define `xxxSchema: JSONSchemaType<XxxTarget>` for ajv validation
  - Export `convertXxxSchema()` function
- [ ] Add `case 'xxx':` in `src/dbt/profile.ts` `warehouseCredentialsFromDbtTarget()`
- [ ] Add mock credentials in `src/handlers/dbt/getWarehouseClient.ts` `getMockCredentials()`

## Layer 6: Docker (`Dockerfile`)

- [ ] Add the dbt adapter pip package (`dbt-xxx`) to dbt venvs **1.8+** in the `Dockerfile`
  - The adapter package name is typically `dbt-xxx` (e.g., `dbt-duckdb`, `dbt-athena`)
  - Use unversioned `"dbt-xxx"` if the adapter has its own version scheme, or `"dbt-xxx~=X.Y.0"` if it tracks dbt-core versions
  - Check [PyPI](https://pypi.org) for the package name and version compatibility
  - Only add to dbt versions that support the adapter (1.8+, not older 1.4-1.7)
  - Reference: `dbt-athena` was added from 1.9+, `dbt-duckdb` from 1.8+

## Layer 7: Demo Project Compatibility (`examples/full-jaffle-shop-demo/`)

- [ ] Update `dbt/data/seeds.yml` column types for the new adapter (DuckDB doesn't support `jsonb`, `TIME`, etc.)
- [ ] Update SQL macros in `dbt/macros/` that have warehouse-specific branches (e.g. `quarter_end_date.sql`, `casts.sql`)
- [ ] Add a profile target in `profiles/profiles.yml` for testing
- [ ] Test: `dbt seed --target xxx && dbt run --target xxx`

## Post-Implementation

- [ ] `pnpm generate-api` (regenerates routes.ts and swagger.json)
- [ ] `pnpm generate:chart-as-code-schema`
- [ ] `pnpm check:chart-as-code-schema`
- [ ] Run full typecheck: `pnpm -F common typecheck && pnpm -F backend typecheck && pnpm -F frontend typecheck`

## Reference Files

| Layer | Key File | Purpose |
|-------|----------|---------|
| Common | `packages/common/src/types/projects.ts` | Types, sensitive fields, unions |
| Backend | `packages/backend/src/dbt/profiles.ts` | dbt profile generation |
| Backend | `packages/backend/src/database/entities/warehouseCredentials.ts` | DB entity |
| Warehouse | `packages/warehouses/src/warehouseClientFromCredentials.ts` | Factory |
| Frontend | `packages/frontend/src/components/ProjectConnection/WarehouseSettingsForm.tsx` | Form registration |
| CLI | `packages/cli/src/dbt/profile.ts` | CLI target conversion |
| Docker | `Dockerfile` | dbt adapter pip packages per version |

## Canonical Examples

- **Athena**: PRs #19751/#19752 (first adapter added with this pattern)
- **MotherDuck/DuckDB**: Branch `02-23-feat_add_duckdb_warehouse_client_with_s3_support`

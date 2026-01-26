---
date: 2026-01-26T15:52:01+00:00
researcher: Claude
git_commit: 7373d0fa666c5ab8ce1dc9a54b26d7819505d16b
branch: claude/add-file-reading-guidelines-aHAKQ
repository: lightdash
topic: "MCP Tool for Warehouse Schema Search"
tags: [research, mcp, warehouse, schema, catalog, sql-runner]
status: complete
last_updated: 2026-01-26
last_updated_by: Claude
last_updated_note: "Added clarifications on cache usage, user credentials, and database scope"
---

# Research: MCP Tool for Warehouse Schema Search

**Date**: 2026-01-26T15:52:01+00:00
**Researcher**: Claude
**Git Commit**: 7373d0fa666c5ab8ce1dc9a54b26d7819505d16b
**Branch**: claude/add-file-reading-guidelines-aHAKQ
**Repository**: lightdash

## Research Question

How to add an efficient schema search MCP tool for the connected warehouse on a Lightdash project, leveraging the existing cached version that powers SQL runner.

## Summary

Lightdash has a comprehensive three-tier caching system for warehouse metadata that can be leveraged for an MCP schema search tool:

1. **`warehouse_credentials_available_tables`** - Database table storing table-level metadata with partition information
2. **`cached_warehouse`** - Database table storing full WarehouseCatalog with column types
3. **In-memory cache** - Optional NodeCache layer with 30s TTL

The existing MCP implementation provides a clear pattern for adding new tools via `McpService.registerTool()`. The SQL runner already has APIs and services for fetching cached warehouse schema data that can be reused.

## Key Clarifications

### Which Cache Does SQL Runner Use?

SQL runner uses **`warehouse_credentials_available_tables`** (table-level cache only), NOT `cached_warehouse`.

- **Table listing**: `ProjectService.getWarehouseTables()` → `WarehouseAvailableTablesModel.getTablesForProjectWarehouseCredentials()`
- **Column fetching**: Done on-demand via `ProjectService.getWarehouseFields()` → `warehouseClient.getFields()` (live query, not cached)

The `cached_warehouse` table (which stores full `WarehouseCatalog` with columns) is used by dbt project compilation, not SQL runner.

### Does getWarehouseTables Have Filtering?

**No.** The current implementation has **zero server-side filtering**.

```typescript
// sqlRunnerController.ts:57-67
async getTables(@Path() projectUuid: string): Promise<ApiWarehouseTablesCatalog> {
    return {
        status: 'ok',
        results: await this.projectService.getWarehouseTables(req.user!, projectUuid),
        // Returns entire WarehouseTablesCatalog - no filter params
    };
}
```

All filtering happens **client-side** in the frontend using Fuse.js fuzzy search (`packages/frontend/src/features/sqlRunner/components/Tables.tsx:319`).

### User-Level Warehouse Credentials

The cache **respects user-specific warehouse credentials**:

```typescript
// ProjectService.ts:4823-4841
const credentials = await this.getWarehouseCredentials({
    projectUuid,
    userId: user.userUuid,  // User-specific lookup
});

if (credentials.userWarehouseCredentialsUuid) {
    // User has personal credentials → separate cache per user
    catalog = await this.warehouseAvailableTablesModel.getTablesForUserWarehouseCredentials(
        credentials.userWarehouseCredentialsUuid,
    );
} else {
    // Falls back to project-level credentials → shared cache
    catalog = await this.warehouseAvailableTablesModel.getTablesForProjectWarehouseCredentials(
        projectUuid,
    );
}
```

The `warehouse_credentials_available_tables` table has two foreign key columns:
- `user_warehouse_credentials_uuid` - For user-specific credentials
- `project_warehouse_credentials_id` - For shared project credentials

### Database Scan Scope

The `getAllTables()` method scans **only the configured database**, not all databases:

| Warehouse | Scope | Filter Logic |
|-----------|-------|--------------|
| **Postgres** | Single database | `WHERE table_catalog = $1` using `config.database` |
| **Snowflake** | Single database | `WHERE TABLE_CATALOG ILIKE ?` using `connectionOptions.database` |
| **Trino** | Single catalog | `WHERE table_catalog = '...'` using `connectionOptions.catalog` |
| **Clickhouse** | Single database | `WHERE database = {databaseName}` using `credentials.schema` |
| **BigQuery** | All datasets in project | `client.getDatasets()` - no database filter, scans all datasets |
| **Databricks** | **All visible catalogs** | No filter in `getAllTables()` - returns everything accessible |

**Source files**:
- `packages/warehouses/src/warehouseClients/PostgresWarehouseClient.ts:483-506`
- `packages/warehouses/src/warehouseClients/SnowflakeWarehouseClient.ts:1003-1031`
- `packages/warehouses/src/warehouseClients/BigqueryWarehouseClient.ts:456-506`
- `packages/warehouses/src/warehouseClients/DatabricksWarehouseClient.ts:496-509`

## Detailed Findings

### Existing Cached Schema Storage

#### 1. Warehouse Available Tables (Table-Level Cache)

**Database Table**: `warehouse_credentials_available_tables`
**Entity**: `packages/backend/src/database/entities/warehouseAvailableTables.ts:4-11`

```typescript
type DbWarehouseAvailableTables = {
    database: string;
    schema: string;
    table: string;
    project_warehouse_credentials_id: number | null;
    user_warehouse_credentials_uuid: string | null;
    partition_column: PartitionColumn | null;
};
```

**Model**: `packages/backend/src/models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel.ts`

Key methods:
- `toWarehouseCatalog()` (lines 20-40) - Converts DB rows to `WarehouseTablesCatalog`
- `getTablesForProjectWarehouseCredentials()` (lines 54-69) - Retrieves cached tables
- `createAvailableTablesForProjectWarehouseCredentials()` (lines 71-114) - Caches tables

#### 2. Full Warehouse Catalog (Column-Level Cache)

**Database Table**: `cached_warehouse`
**Migration**: `packages/backend/src/database/migrations/20220425072608_cache_warehouse.ts`

Stores complete `WarehouseCatalog` as JSONB:

```typescript
// packages/common/src/types/warehouse.ts:23-29
type WarehouseCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: WarehouseTableSchema;  // column -> DimensionType
        };
    };
};
```

**Access Methods** in `ProjectModel` (`packages/backend/src/models/ProjectModel/ProjectModel.ts`):
- `getWarehouseFromCache()` (lines 1344-1369) - Retrieve cached warehouse catalog
- `saveWarehouseToCache()` (lines 1344-1369) - Save warehouse catalog to cache

### Existing SQL Runner API Endpoints

**Controller**: `packages/backend/src/controllers/sqlRunnerController.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/v1/projects/{projectUuid}/sqlRunner/tables` | `getTables()` (lines 53-68) | Returns `WarehouseTablesCatalog` |
| `GET /api/v1/projects/{projectUuid}/sqlRunner/fields` | `getTableFields()` (lines 76-100) | Returns `WarehouseTableSchema` for specific table |
| `POST /api/v1/projects/{projectUuid}/sqlRunner/refresh-catalog` | `refreshSqlRunnerCatalog()` (lines 400-412) | Refreshes cached catalog |

**Service Methods** in `ProjectService` (`packages/backend/src/services/ProjectService/ProjectService.ts`):
- `getWarehouseTables()` (lines 4807-4855) - Returns cached tables, populates if empty
- `getWarehouseFields()` (lines 4857-4929) - Returns fields for specific table
- `populateWarehouseTablesCache()` (lines 4754-4805) - Refreshes warehouse cache

### Existing MCP Tool Pattern

**Service**: `packages/backend/src/ee/services/McpService/McpService.ts`

#### Tool Registration Pattern (lines 234-821):

```typescript
this.mcpServer.registerTool(
    McpToolName.TOOL_NAME,
    {
        description: schema.description,
        inputSchema: getMcpCompatibleSchema(schema),
    },
    async (args, extra: RequestHandlerExtra) => {
        // Extract user context
        const { user } = extra.authInfo.extra;

        // Get project context
        const context = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid
        );

        // Execute business logic
        const result = await someService.doWork();

        // Return formatted response
        return {
            content: [{ type: 'text', text: result }],
        };
    },
);
```

#### Existing MCP Tools:

| Tool | Purpose |
|------|---------|
| `GET_LIGHTDASH_VERSION` | Returns Lightdash version |
| `LIST_EXPLORES` | Lists available explores/data sources |
| `FIND_EXPLORES` | Search explores with filters |
| `FIND_FIELDS` | Search fields in explores |
| `FIND_CONTENT` | Search dashboards/charts |
| `LIST_PROJECTS` | List accessible projects |
| `SET_PROJECT` | Set active project context |
| `GET_CURRENT_PROJECT` | Get active project |
| `RUN_METRIC_QUERY` | Execute queries |
| `SEARCH_FIELD_VALUES` | Search field unique values |

#### Schema Compatibility Layer

**File**: `packages/backend/src/ee/services/McpService/McpSchemaCompatLayer.ts`

Converts Zod schemas to MCP-compatible JSON Schema format.

## Proposed Implementation

### New MCP Tool: `SEARCH_WAREHOUSE_SCHEMA`

#### Purpose
Search through warehouse databases, schemas, tables, and columns with filtering support.

#### Input Schema

```typescript
// packages/common/src/ee/AiAgent/schemas/tools/mcpToolSearchWarehouseSchemaArgs.ts
import { z } from 'zod';

export const mcpToolSearchWarehouseSchemaArgsSchema = z.object({
    query: z.string().optional().describe('Search query to filter results'),
    database: z.string().optional().describe('Filter by database name'),
    schema: z.string().optional().describe('Filter by schema name'),
    table: z.string().optional().describe('Filter by table name'),
    includeColumns: z.boolean().optional().default(false)
        .describe('Include column information in results'),
    limit: z.number().optional().default(100)
        .describe('Maximum number of results to return'),
}).describe('Search warehouse schema for databases, schemas, tables, and columns');
```

#### Implementation Location

Add to `packages/backend/src/ee/services/McpService/McpService.ts`:

```typescript
// Add to McpToolName enum
SEARCH_WAREHOUSE_SCHEMA = 'search_warehouse_schema',

// In setupHandlers()
this.mcpServer.registerTool(
    McpToolName.SEARCH_WAREHOUSE_SCHEMA,
    {
        description: mcpToolSearchWarehouseSchemaArgsSchema.description,
        inputSchema: getMcpCompatibleSchema(mcpToolSearchWarehouseSchemaArgsSchema),
    },
    async (args, extra: RequestHandlerExtra) => {
        const { user } = extra.authInfo.extra as ExtraContext;
        const context = await this.mcpContextModel.getContext(
            user.userUuid,
            user.organizationUuid,
        );

        if (!context?.projectUuid) {
            return { content: [{ type: 'text', text: 'No project selected' }] };
        }

        // Use existing ProjectService method
        const tables = await this.projectService.getWarehouseTables(
            user,
            context.projectUuid,
        );

        // Apply filters and format results
        const results = filterWarehouseCatalog(tables, args);

        return {
            content: [{ type: 'text', text: formatResults(results) }],
        };
    },
);
```

#### Filter Function

```typescript
function filterWarehouseCatalog(
    catalog: WarehouseTablesCatalog,
    filters: {
        query?: string;
        database?: string;
        schema?: string;
        table?: string;
        limit?: number;
    }
): FilteredResult[] {
    const results: FilteredResult[] = [];
    const query = filters.query?.toLowerCase();

    for (const [dbName, schemas] of Object.entries(catalog)) {
        if (filters.database && !dbName.toLowerCase().includes(filters.database.toLowerCase())) {
            continue;
        }

        for (const [schemaName, tables] of Object.entries(schemas)) {
            if (filters.schema && !schemaName.toLowerCase().includes(filters.schema.toLowerCase())) {
                continue;
            }

            for (const [tableName, tableInfo] of Object.entries(tables)) {
                if (filters.table && !tableName.toLowerCase().includes(filters.table.toLowerCase())) {
                    continue;
                }

                const fullName = `${dbName}.${schemaName}.${tableName}`;
                if (query && !fullName.toLowerCase().includes(query)) {
                    continue;
                }

                results.push({
                    database: dbName,
                    schema: schemaName,
                    table: tableName,
                    partitionColumn: tableInfo.partitionColumn,
                });

                if (results.length >= (filters.limit || 100)) {
                    return results;
                }
            }
        }
    }

    return results;
}
```

#### Enhanced Version with Column Search

For column-level search, fetch from `cached_warehouse` or call `getWarehouseFields()`:

```typescript
// If includeColumns is true, fetch full catalog with columns
if (args.includeColumns) {
    const fullCatalog = await this.projectModel.getWarehouseFromCache(context.projectUuid);
    // Search includes column names
}
```

### Services to Reuse

| Service/Model | Method | Purpose |
|---------------|--------|---------|
| `ProjectService` | `getWarehouseTables()` | Get cached table list |
| `ProjectService` | `getWarehouseFields()` | Get columns for specific table |
| `ProjectModel` | `getWarehouseFromCache()` | Get full cached warehouse catalog |
| `WarehouseAvailableTablesModel` | `getTablesForProjectWarehouseCredentials()` | Get tables from DB cache |

## Code References

- `packages/backend/src/ee/services/McpService/McpService.ts` - MCP tool registration
- `packages/backend/src/services/ProjectService/ProjectService.ts:4807-4929` - Warehouse table/field services
- `packages/backend/src/models/ProjectModel/ProjectModel.ts:1344-1369` - Warehouse cache access
- `packages/backend/src/models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel.ts` - Table cache model
- `packages/common/src/types/warehouse.ts:23-44` - Warehouse catalog types
- `packages/backend/src/controllers/sqlRunnerController.ts:53-100` - Existing SQL runner endpoints

## Architecture Notes

### Caching Flow

```
Warehouse Connection
    ↓
WarehouseClient.getAllTables() / getCatalog()
    ↓
warehouse_credentials_available_tables (table list)
cached_warehouse (full catalog with columns)
    ↓
Optional: In-memory NodeCache (30s TTL)
    ↓
MCP Tool → ProjectService.getWarehouseTables()
```

### Authentication & Authorization

MCP tools inherit authentication from the MCP router:
- OAuth token validation
- API key support
- User attributes via `X-Lightdash-User-Attributes` header
- Project access validated via CASL ability checks

## Open Questions

1. **Column search performance**: Should column-level search use the full `cached_warehouse` catalog or fetch fields on-demand per table?

2. **Fuzzy matching**: Should the search support fuzzy matching like the SQL runner's Fuse.js implementation?

3. **Result formatting**: What format works best for AI agents - structured JSON, XML, or formatted text?

4. **Pagination**: Should results support cursor-based pagination for large warehouses?

5. **Cache freshness**: Should the tool expose the cache refresh functionality or rely on automatic refresh?

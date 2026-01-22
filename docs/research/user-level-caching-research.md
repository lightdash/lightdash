# User-Level Query Caching Research

**Issue**: [PROD-736] User-level query caching when using personal database connections

**Date**: 2026-01-22

---

## Executive Summary

This document researches the current state of dashboard query caching in Lightdash, specifically focusing on how caching interacts with user-specific warehouse credentials.

---

## 1. Cache Infrastructure Overview

### 1.1 Cache Service Architecture

The caching system is implemented as an optional service (`ICacheService`) provided by the commercial edition.

**Interface Definition**: `packages/backend/src/services/CacheService/ICacheService.ts:3-9`
```typescript
export interface ICacheService {
    isEnabled: boolean;
    findCachedResultsFile: (
        projectUuid: string,
        cacheKey: string,
    ) => Promise<CacheHitCacheResult | null>;
}
```

**Commercial Implementation**: `packages/backend/src/ee/services/CommercialCacheService.ts:17-95`
- Implements `ICacheService` interface
- Uses `QueryHistoryModel` to find cached results by cache key
- Configurable stale time via `CACHE_STALE_TIME_SECONDS` env var (default: 86400 seconds / 1 day)
- 10-minute expiry buffer to prevent cache expiring during pagination

**OSS Behavior**: When `cacheService` is undefined (OSS edition), cache lookups return `null` via optional chaining in `AsyncQueryService.findResultsCache()` at line 275.

### 1.2 Configuration

**File**: `packages/backend/src/config/parseConfig.ts:1589-1596`

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `RESULTS_CACHE_ENABLED` | `false` | Enables/disables caching |
| `CACHE_STALE_TIME_SECONDS` | `86400` | Cache TTL in seconds |

---

## 2. Cache Key Generation

### 2.1 Implementation

**File**: `packages/backend/src/models/QueryHistoryModel/QueryHistoryModel.ts:62-86`

```typescript
static getCacheKey(
    projectUuid: string,
    resultsIdentifiers: {
        sql: string;
        timezone?: string;
        userUuid: string | null;
    },
) {
    const CACHE_VERSION = 'v3'; // change when we want to force invalidation
    let queryHashKey = `${CACHE_VERSION}.${projectUuid}`;

    // Include user UUID in cache key to prevent sharing cache between users
    // when user-specific warehouse credentials are in use
    if (resultsIdentifiers.userUuid) {
        queryHashKey += `.${resultsIdentifiers.userUuid}`;
    }

    queryHashKey += `.${resultsIdentifiers.sql}`;

    if (resultsIdentifiers.timezone) {
        queryHashKey += `.${resultsIdentifiers.timezone}`;
    }

    return crypto.createHash('sha256').update(queryHashKey).digest('hex');
}
```

### 2.2 Cache Key Components

| Component | Included | Condition |
|-----------|----------|-----------|
| CACHE_VERSION | Always | `v3` prefix for invalidation control |
| projectUuid | Always | - |
| userUuid | Conditional | Only when `resultsIdentifiers.userUuid` is truthy |
| sql | Always | The compiled SQL query |
| timezone | Conditional | Only when provided |

### 2.3 User UUID Inclusion Logic

The `userUuid` is passed to `getCacheKey()` based on whether the user has personal warehouse credentials.

**File**: `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:1842-1845`
```typescript
userUuid:
    warehouseCredentials.userWarehouseCredentialsUuid
        ? account.user.id
        : null,
```

**Key Point**: `userUuid` is included in cache key ONLY when `warehouseCredentials.userWarehouseCredentialsUuid` is set.

---

## 3. User Warehouse Credentials System

### 3.1 Data Model

**User Credentials Table**: `user_warehouse_credentials`
- `user_warehouse_credentials_uuid` (PK)
- `user_uuid` (FK to users)
- `name`, `warehouse_type`, `encrypted_credentials`

**Preference Table**: `project_user_warehouse_credentials_preference`
- Composite key: `[user_uuid, project_uuid]`
- `user_warehouse_credentials_uuid` (FK)
- Stores user's preferred credentials per project

**Entity File**: `packages/backend/src/database/entities/userWarehouseCredentials.ts`

### 3.2 Credential Selection Logic

**File**: `packages/backend/src/services/ProjectService/ProjectService.ts:1101-1193`

The `getWarehouseCredentials()` method determines which credentials to use:

1. Loads base credentials from project or organization
2. Checks if user credentials should be fetched based on:
   - `requireUserCredentials` flag is `true` (mandatory)
   - OR warehouse type is `DATABRICKS` (optional user OAuth)
3. For registered users with credentials:
   - Merges user credentials with base project credentials
   - Sets `userWarehouseCredentialsUuid` on returned object
4. For users without credentials when required: throws `NotFoundError`
5. For embedded users when `requireUserCredentials`: throws `ForbiddenError`

### 3.3 The `requireUserCredentials` Flag

**Type Definition**: `packages/common/src/types/projects.ts`

This flag is defined on each warehouse credentials type:
- `CreateBigqueryCredentials` (line 53)
- `CreateDatabricksCredentials` (line 102)
- `CreatePostgresCredentials` (line 130)
- `CreateTrinoCredentials` (line 150)
- `CreateClickhouseCredentials` (line 167)
- `CreateRedshiftCredentials` (line 183)
- `CreateSnowflakeCredentials` (line 212)

When `true`, all users must provide their own warehouse credentials to query.

---

## 4. Query Execution Flow

### 4.1 Interactive Dashboard Chart Query

**Entry Point**: `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:2380-2591`

Method: `executeAsyncDashboardChartQuery()`

Flow:
1. Retrieves saved chart (line 2397)
2. Applies dashboard filters/sorts (lines 2428-2445)
3. Fetches warehouse credentials (lines 2506-2510)
4. Compiles metric query to SQL (lines 2546-2561)
5. Calls `executeAsyncQuery()` (lines 2563-2580)

### 4.2 Core Async Query Execution

**File**: `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:1719-1935`

Method: `executeAsyncQuery()`

Flow:
1. Fetches warehouse credentials (lines 1777-1782)
2. Generates cache key with userUuid if user has credentials (lines 1837-1847)
3. Looks up cache (lines 1849-1853)
4. Creates query history record (lines 1855-1866)
5. If cache hit: Updates query to READY, returns immediately (lines 1897-1918)
6. If cache miss: Executes warehouse query via `runAsyncWarehouseQuery()`

### 4.3 Scheduled Query Execution

**File**: `packages/backend/src/scheduler/SchedulerTask.ts`

Scheduled queries execute as the **scheduler creator**, not the dashboard viewer:
- Loads user who created the scheduler (line 2937-2939)
- Creates Account from that user's session
- Uses that user's warehouse credentials
- Same cache key logic applies

---

## 5. Cache Storage

### 5.1 Query History Table

**Entity**: `packages/backend/src/database/entities/queryHistory.ts:14-43`

Cache-related fields:
| Field | Type | Description |
|-------|------|-------------|
| `cache_key` | string | SHA256 hash of cache components |
| `results_file_name` | string | S3 file name for results |
| `results_created_at` | Date | When results were cached |
| `results_updated_at` | Date | Last update time |
| `results_expires_at` | Date | Cache expiration time |
| `columns` | ResultColumns | Result column metadata |
| `total_row_count` | number | Number of rows in results |

### 5.2 S3 Results Storage

**File**: `packages/backend/src/clients/ResultsFileStorageClients/S3ResultsFileStorageClient.ts`

- Results stored as JSONL files in S3
- File name format: `{cacheKey}-{nanoid}`
- Configured via `RESULTS_S3_*` environment variables

---

## 6. Cache Lookup Flow

**File**: `packages/backend/src/ee/services/CommercialCacheService.ts:38-94`

Method: `findCachedResultsFile()`

1. Checks if caching is enabled (line 43)
2. Finds most recent query by cache key via `QueryHistoryModel.findMostRecentByCacheKey()` (lines 48-52)
3. Validates cache has not expired with buffer time (lines 66-76)
4. Returns cache metadata if valid, `null` otherwise

**Query History Lookup**: `packages/backend/src/models/QueryHistoryModel/QueryHistoryModel.ts:213-237`
```typescript
async findMostRecentByCacheKey(cacheKey: string, projectUuid: string) {
    const result = await this.database(QueryHistoryTableName)
        .where('cache_key', cacheKey)
        .andWhere('project_uuid', projectUuid)
        .orderBy('created_at', 'desc')
        .limit(1)
        .first();
    // ...
}
```

---

## 7. Current Behavior Summary

### When Cache Keys Include User UUID

Cache is **user-specific** when:
- User has personal warehouse credentials configured for the project
- Those credentials are selected via preference table or auto-selection
- `warehouseCredentials.userWarehouseCredentialsUuid` is set

### When Cache Keys Do NOT Include User UUID

Cache is **shared across all users** when:
- `requireUserCredentials` is `false` AND
- User has no personal warehouse credentials AND
- Warehouse type is not Databricks (or user has no Databricks credentials)

---

## 8. Test Coverage

**File**: `packages/backend/src/models/QueryHistoryModel/QueryHistoryModel.test.ts:4-129`

Existing tests verify:
- Same hash for `userUuid: null` (backward compatibility) - lines 71-83
- Different hashes for different users - lines 85-98
- Same hash for same user - lines 101-114
- Different hash for `null` vs specific userUuid - lines 116-129

---

## 9. Key Files Reference

| File | Purpose |
|------|---------|
| `packages/backend/src/models/QueryHistoryModel/QueryHistoryModel.ts` | Cache key generation, query history CRUD |
| `packages/backend/src/ee/services/CommercialCacheService.ts` | Cache service implementation |
| `packages/backend/src/services/CacheService/ICacheService.ts` | Cache service interface |
| `packages/backend/src/services/CacheService/types.ts` | Cache result types |
| `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts` | Query execution with caching |
| `packages/backend/src/services/ProjectService/ProjectService.ts` | Warehouse credential resolution |
| `packages/backend/src/models/UserWarehouseCredentials/UserWarehouseCredentialsModel.ts` | User credentials data access |
| `packages/backend/src/database/entities/userWarehouseCredentials.ts` | User credentials DB entity |
| `packages/backend/src/database/entities/queryHistory.ts` | Query history DB entity |
| `packages/common/src/types/projects.ts` | Warehouse credentials types with `requireUserCredentials` |
| `packages/backend/src/config/parseConfig.ts` | Cache configuration |

---

## 10. Related Database Tables

| Table | Purpose |
|-------|---------|
| `query_history` | Stores query metadata including cache keys and results references |
| `user_warehouse_credentials` | User-specific warehouse credentials (encrypted) |
| `project_user_warehouse_credentials_preference` | User's preferred credentials per project |

---

## 11. API Endpoints Related to User Credentials

| Endpoint | File | Description |
|----------|------|-------------|
| `GET /api/v1/user/warehouseCredentials` | `userController.ts:245-259` | List user's credentials |
| `POST /api/v1/user/warehouseCredentials` | `userController.ts:264-281` | Create credentials |
| `PATCH /api/v1/user/warehouseCredentials/{uuid}` | `userController.ts:286-304` | Update credentials |
| `DELETE /api/v1/user/warehouseCredentials/{uuid}` | `userController.ts:309-324` | Delete credentials |
| `GET /api/v1/projects/{projectUuid}/user-credentials` | `projectController.ts:434-450` | Get project preference |
| `PATCH /api/v1/projects/{projectUuid}/user-credentials/{uuid}` | `projectController.ts:454-473` | Set project preference |

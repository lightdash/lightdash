<summary>
The models folder contains data access and business logic components for the Lightdash backend. Models encapsulate database operations and domain-specific logic for entities like users, organizations, dashboards, and more.
</summary>

<howToUse>
Models are accessed through the ModelRepository, which acts as a container for all models. The repository implements a factory pattern with memoization for performance.

To use models in your code:

1. Get a model instance from the ModelRepository:

```typescript
// In a service
const userModel = modelRepository.getUserModel();
const organizationModel = modelRepository.getOrganizationModel();
```

2. Call methods on the model to perform operations:

```typescript
// Get a user by ID
const user = await userModel.getUserById(userId);

// Create a new organization
const newOrg = await organizationModel.createOrganization({
    name: 'New Organization',
    // other properties...
});
```

</howToUse>

<codeExample>
Example: Using UserModel to create and retrieve users

```typescript
// Get model instances from repository
const userModel = modelRepository.getUserModel();

// Create a new user in an organization
const newUser = await userModel.createUser({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    password: 'securePassword123',
    organizationId: existingOrgId,
    role: OrganizationMemberRole.MEMBER,
});

// Find a user by email
const user = await userModel.findUserByEmail('john.doe@example.com');
```

</codeExample>

<importantToKnow>
- Models handle database transactions internally when needed
- Authentication and authorization checks are typically performed in the Express middleware level
- Models use the Knex.js query builder for database operations
- The ModelRepository supports dependency injection through model providers
- Some models require additional dependencies beyond the database connection
- When adding a new model, add it to the ModelManifest type in ModelRepository.ts
- Method naming conventions follow consistent patterns:
  - Methods that start with `find` return undefined or empty array if no row is found
  - Methods that start with `get` throw an error if no row is found
  - Methods that start with `create` validate input and return the created entity
  - Methods that start with `update` modify an entity and return the updated version
  - Methods that start with `delete` remove an entity and typically return void
</importantToKnow>

## Soft Delete Pattern

Multiple tables support soft delete via `deleted_at` + `deleted_by_user_uuid` columns. When `lightdashConfig.softDelete.enabled` is true, records are soft-deleted instead of permanently removed.

### Tables with Soft Delete

| Table           | Constant               | Entity file               |
| --------------- | ---------------------- | ------------------------- |
| `saved_queries` | `SavedChartsTableName` | `entities/savedCharts.ts` |
| `dashboards`    | `DashboardsTableName`  | `entities/dashboards.ts`  |
| `spaces`        | `SpaceTableName`       | `entities/spaces.ts`      |
| `saved_sql`     | `SavedSqlTableName`    | `entities/savedSql.ts`    |
| `scheduler`     | `SchedulerTableName`   | `entities/scheduler.ts`   |

Each has partial indexes for `WHERE deleted_at IS NULL` and `WHERE deleted_at IS NOT NULL`.

### IMPORTANT: Filtering Soft-Deleted Records

Any query that reads from the tables above **must** filter out soft-deleted records — otherwise deleted data leaks into results.

**Direct query — add `whereNull`:**

```typescript
this.database(SavedChartsTableName).whereNull('deleted_at');
```

**Simple join — add `whereNull` on joined table:**

```typescript
.leftJoin(DashboardsTableName, ...)
.whereNull(`${DashboardsTableName}.deleted_at`)
```

**Function-style join — use `andOnNull` in the join condition:**

```typescript
.leftJoin(DashboardsTableName, function () {
    this.on('col1', '=', 'col2')
        .andOnNull(`${DashboardsTableName}.deleted_at`);
})
```

**Raw SQL — add `AND deleted_at IS NULL`:**

```sql
LEFT JOIN ${DashboardsTableName} d ON d.dashboard_uuid = ... AND d.deleted_at IS NULL
WHERE ... AND sq.deleted_at IS NULL
```

### Finding Queries That Need Filters

Search both `packages/backend/src/models/` and `packages/backend/src/ee/models/` for usages:

```bash
grep -rn "saved_queries\|SavedChartsTableName" packages/backend/src/models/ packages/backend/src/ee/models/
grep -rn "dashboards\|DashboardsTableName" packages/backend/src/models/ packages/backend/src/ee/models/
grep -rn "spaces\|SpaceTableName" packages/backend/src/models/ packages/backend/src/ee/models/
grep -rn "saved_sql\|SavedSqlTableName" packages/backend/src/models/ packages/backend/src/ee/models/
grep -rn "scheduler\|SchedulerTableName" packages/backend/src/models/ packages/backend/src/ee/models/
```

Review each result. If it's a SELECT, JOIN, or subquery returning data, it needs the `deleted_at IS NULL` filter.

### When NOT to filter by `deleted_at IS NULL`

- **Slug generation**: Slugs must be unique across all records including deleted ones. Deleted content can be restored, so slug uniqueness checks must include soft-deleted rows.
- **Soft delete feature itself**: Queries that list deleted content (`whereNotNull('deleted_at')`), restore deleted content, or permanently delete content should obviously not exclude deleted records.

## KeyValue Cache Client

Models can optionally receive a `KeyValueCacheClient` for external caching. This is injected via `ModelRepository` and sits alongside the existing in-memory `NodeCache`. When `REDIS_URL` is not set, the client is `undefined` and everything falls back to NodeCache (or no cache at all).

### How it flows

1. `ModelRepository` receives an optional `keyValueCacheClient` (created when `REDIS_URL` is set)
2. `ModelRepository` passes the same client instance to any model that needs caching
3. Models accept the client as an optional constructor arg
4. Models are responsible for using well-structured keys (see naming conventions below) — there is no automatic prefix. This allows multiple models to read/write/invalidate the same cache entries when needed.

### Adding caching to a model

1. Add `keyValueCacheClient?: KeyValueCacheClient` to the model's constructor args type
2. Store it as a private readonly property
3. In `ModelRepository`, pass `this.keyValueCacheClient` to the model
4. In the model method, check cache then DB. Write back to cache on miss.

```typescript
// In ModelRepository
public getMyModel(): MyModel {
    return this.getModel(
        'myModel',
        () =>
            new MyModel({
                database: this.database,
                keyValueCacheClient: this.keyValueCacheClient,
            }),
    );
}

// In the model method
async getExpensiveThing(projectUuid: string): Promise<Thing> {
    const cacheKey = `project:${projectUuid}:thing`;

    // 1. Try cache
    const cached = await this.keyValueCacheClient?.get<Thing>(cacheKey);
    if (cached) return cached;

    // 2. Query DB
    const result = await this.database('things').where('project_uuid', projectUuid).first();

    // 3. Write to cache
    await this.keyValueCacheClient?.set(cacheKey, result, 30);

    return result;
}
```

### Key naming conventions

Keys must follow the pattern `<entity>:<uuid>:<property>` to be consistent and debuggable:

| Pattern | Example | Used for |
|---------|---------|----------|
| `project:<uuid>:<property>` | `project:abc-123:warehouseCredentials` | Project-scoped data |
| `project:<uuid>:explores:<names>:<changeset>` | `project:abc-123:explores:all:2024-01-01T00:00:00.000Z` | Explores with versioning |
| `<userUuid>::<orgUuid>` | `user-123::org-456` | Session user cache |

Rules:
- **Use colons as separators** — they make `SCAN`/`delByPrefix` predictable
- **Lead with the entity type** (e.g., `project`, `user`) so keys are grouped logically
- **Include the UUID** of the owning entity so cache entries are scoped and independently invalidatable
- **End with the property name** to distinguish different cached values for the same entity
- **Include versioning info** (timestamps, changesets) in the key when the data is version-sensitive — this makes stale entries expire naturally via TTL without explicit invalidation

### Invalidation

- **On mutation**: When a model method updates or deletes an entity, explicitly `del` the corresponding cache keys
- **On delete**: Use `delByPrefix` to wipe all cached data for an entity (e.g., `delByPrefix("project:<uuid>:")` on project delete)
- **TTL-based**: All caches use 30-second TTL as the default. Prefer short TTLs over complex invalidation logic.
- **Version-in-key**: For data that changes with a known version (e.g., explores with changesets), embed the version in the key so old entries expire naturally via TTL without explicit invalidation

### Interface

```typescript
interface KeyValueCacheClient {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    delByPrefix(prefix: string): Promise<void>;
}
```

Source: `packages/backend/src/clients/CacheClient/`

<links>
- Database entities: @/packages/backend/src/database/entities
- Common types: @/packages/common/src/types
- API controllers: @/packages/backend/src/controllers
- Cache client: @/packages/backend/src/clients/CacheClient
</links>

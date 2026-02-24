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


<links>
- Database entities: @/packages/backend/src/database/entities
- Common types: @/packages/common/src/types
- API controllers: @/packages/backend/src/controllers
</links>

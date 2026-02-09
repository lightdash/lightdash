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

## Soft Delete Pattern

The `saved_queries` table supports soft delete. When `SOFT_DELETE_ENABLED=true`, charts are soft-deleted (marked with `deleted_at` timestamp) instead of permanently removed.

### Key Points

- Columns: `deleted_at` (timestamp), `deleted_by_user_uuid` (UUID)
- Partial index: `idx_saved_queries_not_deleted` for fast queries on non-deleted items
- Feature flag: `lightdashConfig.softDelete.enabled` controls behavior in SavedChartService

### When Modifying Queries

Any query that touches `saved_queries` must filter out soft-deleted records:

**Direct Knex query:**

```typescript
const charts = await this.database(SavedChartsTableName)
    .whereNull('deleted_at') // ADD THIS
    .where('project_uuid', projectUuid);
```

**Knex join (simple):**

```typescript
.leftJoin(SavedChartsTableName, ...)
.whereNull(`${SavedChartsTableName}.deleted_at`)  // ADD THIS
```

**Knex join (function syntax - for join conditions):**

```typescript
.leftJoin(SavedChartsTableName, function () {
    this.on('column1', '=', 'column2')
        .andOnNull(`${SavedChartsTableName}.deleted_at`);  // ADD THIS
})
```

**Raw SQL join:**

```sql
-- Add to join condition:
left join ${SavedChartsTableName} sq on sq.saved_query_uuid = ... AND sq.deleted_at IS NULL
```

**Raw SQL WHERE clause:**

```sql
WHERE ... AND sq.deleted_at IS NULL
```

### Finding Queries That Need Soft Delete Filters

The table is `saved_queries`, exported as `SavedChartsTableName` from entities.

```bash
# Search for the table name (covers string literals and raw SQL)
grep -rn "saved_queries" packages/backend/src/models/

# Search for the constant (covers Knex queries using the constant)
grep -rn "SavedChartsTableName" packages/backend/src/models/
```

Review each result. If it's a SELECT, JOIN, or subquery that returns chart data, it needs `whereNull('deleted_at')` or `AND deleted_at IS NULL`.
</importantToKnow>

<links>
- Database entities: @/packages/backend/src/database/entities
- Common types: @/packages/common/src/types
- API controllers: @/packages/backend/src/controllers
</links>

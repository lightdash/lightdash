<summary>
Database layer built on Knex.js and PostgreSQL providing entity definitions, migrations, pagination utilities, and development seeds. Supports multi-tenant architecture with 40+ entities covering users, organizations, projects, charts, dashboards, and analytics.
</summary>

<howToUse>
The database module is organized into entities, migrations, and utilities. Use entities for type-safe database operations, migrations for schema changes, and pagination for efficient data retrieval.

```typescript
import { KnexPaginate } from './pagination';
import { DatabaseService } from '../services/DatabaseService';

// Entity usage (example with projects table)
const project = await database('projects')
    .where('project_uuid', projectUuid)
    .first();

// Pagination usage
const paginatedResults = await KnexPaginate.paginate(
    database('saved_charts').where('project_id', projectId),
    { page: 1, pageSize: 25 },
);

// Migration execution
await database.migrate.latest();
```

</howToUse>

<codeExample>

```typescript
// Example: Create a new saved chart with proper entity types
import { SavedChartTable } from './entities/savedCharts';

const newChart: Omit<SavedChartTable['_']['insert'], 'saved_query_id'> = {
    saved_query_uuid: uuidv4(),
    name: 'Sales Dashboard',
    description: 'Monthly sales metrics',
    project_id: project.project_id,
    space_id: space.space_id,
    created_by_user_uuid: user.user_uuid,
    // ... other required fields
};

const [chartId] = await database('saved_charts').insert(newChart);

// Example: Paginated query with search
const searchResults = await KnexPaginate.paginate(
    database('catalog_search')
        .where('project_uuid', projectUuid)
        .whereILike('name', `%${searchTerm}%`)
        .orderBy('relevance_score', 'desc'),
    { page: 1, pageSize: 50 },
);

console.log(`Found ${searchResults.pagination.totalResults} results`);
```

</codeExample>

<importantToKnow>
- All entities use composite table types (DbEntity, CreateEntity, UpdateEntity) for type safety
- UUIDs are used for external API identifiers while internal IDs are auto-incrementing integers
- **Foreign key preference**: When referencing other tables, prefer using UUID columns (e.g., `organization_uuid`) over integer IDs (e.g., `organization_id`). This maintains consistency with the external API and simplifies joins.
- The migration system supports both up/down functions and includes 150+ historical migrations
- KnexPaginate uses CTEs for efficient counting and supports both paginated and unpaginated modes
- Development seeds provide realistic multi-tenant test data with encrypted credentials
- Search functionality uses PostgreSQL vector embeddings and full-text search
- Multi-tenancy is enforced through organization-based data isolation
- JSONB columns are used extensively for flexible schema evolution
- Connection pooling is configured for production workloads
</importantToKnow>

<links>
@/packages/backend/src/database/entities/ - Complete entity definitions directory
@/packages/backend/src/database/entities/CLAUDE.md - Detailed guide for creating entity files
@/packages/backend/src/database/migrations/ - Database migration history
@/packages/backend/knexfile.ts - Database configuration and connection settings
@/packages/backend/src/database/seeds/development/ - Development seed data
</links>

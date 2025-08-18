<summary>
Development scripts and utilities for database migration management. Currently contains a migration creation script that supports both open-source and enterprise edition migrations with interactive prompts.
</summary>

<howToUse>
Scripts in this folder are typically run via npm/pnpm scripts during development. The main script handles database migration creation with support for OSS and EE editions.

```bash
# Create a new database migration
pnpm -F backend create-migration add_user_permissions

# The script will prompt you to choose OSS or EE
# Create migration in (1) OSS or (2) EE? [1/2]: 1

# For EE migrations, ensure license key is set
export LIGHTDASH_LICENSE_KEY="your-ee-license-key"
pnpm -F backend create-migration add_enterprise_feature
```

The script uses the Knex CLI under the hood to create properly timestamped migration files in the correct directory.
</howToUse>

<codeExample>

```typescript
// Example: Running the migration creation script
// Input: pnpm create-migration add_chart_permissions
// Prompts: "Create migration in (1) OSS or (2) EE? [1/2]: 1"
// Output: Creates file like: 20240125143022_add_chart_permissions.ts

// The created migration file structure:
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_charts', (table) => {
        table.jsonb('permissions').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_charts', (table) => {
        table.dropColumn('permissions');
    });
}

// For EE migrations with license validation:
// export LIGHTDASH_LICENSE_KEY="ee-license-key"
// pnpm create-migration add_sso_config
// Creates migration in: src/ee/database/migrations/
```

</codeExample>

<importantToKnow>
- Only contains one script currently: `create-migration.ts` for database migration management
- Interactive prompt allows choosing between OSS and Enterprise Edition migrations
- EE migrations require `LIGHTDASH_LICENSE_KEY` environment variable to be set
- OSS migrations are created in `database/migrations/` directory
- EE migrations are created in `ee/database/migrations/` directory
- Uses Knex CLI (`knex migrate:make`) under the hood for consistent file naming
- Script validates input and provides helpful error messages for missing parameters
- Migration files are automatically timestamped using Knex's naming convention
- Supports both npm and pnpm for running the script
- Error handling includes proper exit codes for CI/CD integration
</importantToKnow>

<links>
@/packages/backend/src/database/migrations/ - OSS migration files directory
@/packages/backend/src/ee/database/migrations/ - Enterprise migration files directory
@/packages/backend/src/knexfile.ts - Knex configuration for migrations
@/packages/backend/package.json - NPM scripts that use these utilities
</links>

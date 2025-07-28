<summary>
dbt integration clients for interfacing with dbt projects through CLI commands and dbt Cloud Metadata API. Handles project compilation, manifest parsing, and profile generation for multiple warehouse types and dbt versions.
</summary>

<howToUse>
The module provides two main clients: DbtCliClient for local dbt installations and DbtMetadataApiClient for dbt Cloud integration. Use these to compile dbt projects and extract metadata.

```typescript
import { DbtCliClient } from './dbtCliClient';
import { DbtMetadataApiClient } from './DbtMetadataApiClient';
import { generateProfiles } from './profiles';

// Local dbt CLI usage
const dbtClient = new DbtCliClient({
    dbtProjectDirectory: '/path/to/dbt/project',
    dbtProfilesDirectory: '/tmp/profiles',
    environment: process.env,
    dbtVersion: 'v1.8',
    useDbtLs: true,
});

const manifest = await dbtClient.getDbtManifest();
const catalog = await dbtClient.getDbtCatalog();

// dbt Cloud API usage
const cloudClient = new DbtMetadataApiClient({
    domain: 'cloud.getdbt.com',
    serviceToken: 'your-token',
    environmentId: 'env-123',
});

const cloudManifest = await cloudClient.getDbtManifest();
```

</howToUse>

<codeExample>

```typescript
// Example: Compile dbt project and get models
const dbtClient = new DbtCliClient({
    dbtProjectDirectory: project.dbtProjectPath,
    dbtProfilesDirectory: '/tmp/dbt-profiles',
    environment: {
        LIGHTDASH_DBT_PROFILE_VAR_HOST: warehouse.host,
        LIGHTDASH_DBT_PROFILE_VAR_USER: warehouse.user,
        LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: warehouse.password,
    },
    profileName: 'lightdash_profile',
    target: 'prod',
    dbtVersion: 'v1.8',
});

// Install dependencies and compile
await dbtClient.installDeps();
const results = await dbtClient.compile();

// Get compiled manifest with model definitions
const manifest = await dbtClient.getDbtManifest();
console.log(`Found ${Object.keys(manifest.nodes).length} dbt models`);

// Example: Generate profiles.yml for warehouse connection
const profiles = generateProfiles(warehouseCredentials, '/tmp/profiles');
await fs.writeFile('/tmp/profiles/profiles.yml', profiles.profiles);
```

</codeExample>

<importantToKnow>
- DbtCliClient supports multiple dbt versions (1.4 through 1.10) with version-specific commands
- Profiles are auto-generated from warehouse credentials and use environment variables for security
- The client automatically modifies dbt_project.yml to set target-path to '/target'
- DbtMetadataApiClient uses GraphQL to fetch metadata from dbt Cloud with pagination
- Quote characters are adapter-specific (backticks for BigQuery, quotes for Snowflake/Postgres)
- Selector validation ensures dbt ls commands use proper syntax
- Error handling includes specific dbt error parsing and Sentry integration
- Profile generation supports all major warehouse types with authentication methods
- File operations are handled asynchronously with proper error handling
</importantToKnow>

<links>
@/packages/common/src/types/dbt.ts - dbt-related type definitions
@/packages/backend/src/types.ts - DbtClient interface definition
@/packages/common/src/types/warehouse.ts - Warehouse credential types
</links>

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
    environment: { LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: 'password' },
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
- The dbt subprocess does NOT inherit the backend environment (`extendEnv: false`). It gets only what `dbtProcessEnvironment.ts` lists by exact name, machine variables parsed from `ALLOW_DBT_COMMANDS_ACCESS_TO_ENV_VARS` into `LightdashConfig.dbt.environmentVariableAllowlist`, plus the project and profile variables. Anything a dbt project can read with `env_var()` ends up in compiled explore metadata, which any project viewer can read
- The only dbt commands we run are `deps`, `ls` and `parse`, and none of them connects to the warehouse (verified against a dead endpoint on dbt-postgres). The warehouse connection in a compile comes from the Node `warehouseClient` in `dbtBaseProjectAdapter`, not from the dbt subprocess, so the cloud credentials on that list are probably unnecessary. They are still shared while that is confirmed on the adapters that authenticate from the host; narrowing them is follow up work
- Profiles are auto-generated from warehouse credentials and use environment variables for security
- The client automatically modifies dbt_project.yml to set target-path to '/target'
- DbtMetadataApiClient uses GraphQL to fetch metadata from dbt Cloud with pagination
- DbtMetadataApiClient also fetches MetricFlow semantic models + metrics from the Discovery API definition state and maps them into `manifest.semantic_models`/`manifest.metrics` (manifest shapes); `DbtBaseProjectAdapter.compileAllExplores` translates them into Lightdash metrics via `applyMetricFlowMetricsToModels` (best-effort — failures degrade to no translated metrics). Known Discovery API gaps: measure `agg_params` (percentile metrics are skipped), measure/dimension `config.meta`, dimension `expr`. Live test env: see `examples/metricflow-demo/cloud/README.md`
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

<summary>
Project adapter system implementing the adapter pattern to provide unified access to dbt projects across different Git providers (GitHub, GitLab, Bitbucket, Azure DevOps), dbt Cloud IDE, and local environments. Handles compilation, authentication, and warehouse integration.
</summary>

<howToUse>
Project adapters are created through the factory function based on project configuration. The adapter provides a consistent interface regardless of the underlying dbt project type or Git provider.

```typescript
import { projectAdapterFromConfig } from './projectAdapters/projectAdapter';

// Create adapter from project configuration
const adapter = await projectAdapterFromConfig(
    projectConfig,
    warehouseClient,
    { organizationUuid, projectUuid },
    dbtVersion,
);

// Compile all explores from dbt project
const explores = await adapter.compileAllExplores();

// Test connection to both dbt and warehouse
await adapter.test();

// Get dbt packages information
const packages = await adapter.getDbtPackages();

// Clean up resources when done
await adapter.destroy();
```

</howToUse>

<codeExample>

```typescript
// Example: GitHub project with personal access token
const githubConfig = {
    type: DbtProjectType.GITHUB,
    github_installation_id: 'install-123',
    github_repository: 'my-org/dbt-project',
    github_branch: 'main',
    dbt_project_subdirectory: 'analytics/',
    warehouse_connection: warehouseCredentials,
};

const githubAdapter = await projectAdapterFromConfig(
    githubConfig,
    warehouseClient,
    { organizationUuid: 'org-123', projectUuid: 'proj-456' },
    'v1.8',
);

// Compile explores from GitHub repository
const explores = await githubAdapter.compileAllExplores();

// Example: Local dbt project
const localConfig = {
    type: DbtProjectType.DBT,
    dbt_project_directory: '/path/to/dbt/project',
    warehouse_connection: warehouseCredentials,
};

const localAdapter = await projectAdapterFromConfig(
    localConfig,
    warehouseClient,
    context,
    'v1.8',
);

// Example: dbt Cloud IDE integration
const cloudConfig = {
    type: DbtProjectType.DBT_CLOUD_IDE,
    dbt_cloud_environment_id: 'env-789',
    dbt_cloud_api_key: 'api-key-secret',
    dbt_cloud_discovery_api_url: 'https://cloud.getdbt.com/discovery',
    warehouse_connection: warehouseCredentials,
};

const cloudAdapter = await projectAdapterFromConfig(
    cloudConfig,
    warehouseClient,
    context,
);
```

</codeExample>

<importantToKnow>
- All adapters implement the ProjectAdapter interface for consistent API across different providers
- Git adapters automatically handle repository cloning and authentication using temporary directories
- DbtBaseProjectAdapter provides core functionality like manifest parsing and explore compilation
- GitHub adapter supports both personal access tokens and GitHub App installation tokens
- Each Git provider has specific URL authentication patterns and credential requirements
- DbtCloudIdeProjectAdapter uses Metadata API instead of local dbt CLI compilation
- Local adapters create temporary dbt profiles with warehouse credentials for security
- Adapters handle cleanup of temporary resources automatically via destroy() method
- Error handling includes specific Git authentication errors and dbt compilation failures
- Factory pattern in projectAdapterFromConfig() selects appropriate adapter based on DbtProjectType
- Warehouse client integration allows for catalog validation and type attachment
</importantToKnow>

<links>
@/packages/backend/src/types.ts - ProjectAdapter interface definition
@/packages/backend/src/dbt/dbtCliClient.ts - dbt CLI integration
@/packages/backend/src/clients/github/Github.ts - GitHub API client
@/packages/common/src/types/dbt.ts - dbt project configuration types
</links>

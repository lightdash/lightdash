# CLI Handlers Module

<summary>
Command handlers for the Lightdash CLI that execute core operations like authentication, compilation, deployment, and project management. Each handler implements the business logic for a specific CLI command and provides user feedback through the terminal interface.
</summary>

<howToUse>
Handlers are called by the main CLI framework (Commander.js) when users execute commands. Each handler follows a consistent pattern:

1. Parse and validate command options
2. Set up global state (verbose logging, analytics)
3. Execute the core operation
4. Provide user feedback and handle errors

Most handlers require authentication and project context. The compile/deploy workflow is the most common usage pattern.
</howToUse>

<codeExample>
```typescript
// Compile dbt models and validate explores
import { compile, CompileHandlerOptions } from './compile';

const options: CompileHandlerOptions = {
projectDir: './dbt-project',
profilesDir: './profiles',
target: 'dev',
verbose: true,
skipWarehouseCatalog: false
};

const explores = await compile(options);
console.info(`Compiled ${explores.length} explores`);

// Deploy to Lightdash instance
import { deployHandler } from './deploy';

await deployHandler({
...options,
create: true, // Create new project
ignoreErrors: false
});

// Login with different methods
import { login } from './login';

// OAuth login
await login('https://app.lightdash.cloud', {
oauth: true,
verbose: false
});

// Token-based login
await login('https://app.lightdash.cloud', {
token: 'your-api-token',
verbose: false
});

```
</codeExample>

<importantToKnow>
**Authentication Flow**: Most handlers require valid authentication context stored in ~/.lightdash/ config. Use @/login.ts or @/oauthLogin.ts first.

**Compile Dependencies**: The compile handler is the foundation - it loads dbt manifest, validates models, fetches warehouse catalog, and converts to Lightdash explores. Used by deploy, preview, and validation handlers.

**Error Handling**: Handlers use consistent error patterns with styled terminal output. Compilation errors can be ignored in deploy with `--ignore-errors` flag.

**dbt Integration**: Handlers in @/dbt/ subdirectory manage dbt execution, manifest parsing, and warehouse connections. The CLI can skip dbt compilation with `--skip-dbt-compile` when users manage dbt separately.

**Project Context**: Deploy/preview handlers need either existing project UUID (from config) or `--create` flag to create new projects. Use @/setProject.ts to manage project selection.

**Analytics**: All handlers track usage events through LightdashAnalytics for telemetry and error monitoring.
</importantToKnow>

<links>
- Main CLI entry point: @/../../index.ts
- Configuration management: @/../../config.ts
- dbt integration utilities: @/dbt/
- Authentication helpers: @/login/ subdirectory
- Global state and logging: @/../../globalState.ts
- Warehouse client management: @/../../warehouse/
</links>
```

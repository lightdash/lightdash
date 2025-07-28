# Configuration Module

<summary>
Centralized configuration management system that transforms environment variables into a structured, typed configuration object. Provides the authoritative source of truth for all backend application behavior including database connections, authentication, external services, and feature flags.
</summary>

<howToUse>
The configuration is primarily accessed via dependency injection - avoid direct imports when possible:

```typescript
// Preferred: Dependency injection in services
class MyService extends BaseService {
    constructor(args: { lightdashConfig: LightdashConfig }) {
        super();
        this.lightdashConfig = args.lightdashConfig;
    }
}

// Partial configuration injection for focused components
class PrometheusMetrics {
    constructor(config: LightdashConfig['prometheus']) {
        this.config = config;
    }
}

// Avoid: Direct import (use only when dependency injection isn't feasible)
import { lightdashConfig } from './lightdashConfig';
```

Key configuration sections:

-   `database` - Database connection and pooling settings
-   `auth` - Authentication providers and security settings
-   `scheduler` - Background job configuration with task filtering
-   `ai.copilot` - AI features with provider-specific settings
-   `prometheus` - Metrics and monitoring configuration
-   `initialSetup`/`updateSetup` - Automated deployment configuration
    </howToUse>

<codeExample>

```typescript
// Service with injected configuration
class InstanceConfigurationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        database: Database;
    }) {
        super();
        this.lightdashConfig = args.lightdashConfig;
    }

    isFeatureEnabled(): boolean {
        return this.lightdashConfig.allowMultipleOrgs;
    }
}

// Service with partial configuration injection
class EmailService extends BaseService {
    private readonly smtpConfig: LightdashConfig['smtp'];

    constructor(args: { smtpConfig: LightdashConfig['smtp'] }) {
        super();
        this.smtpConfig = args.smtpConfig;
    }
}

// Parse custom configuration for testing
import { parseConfig } from './parseConfig';
const testConfig = parseConfig({
    LIGHTDASH_SECRET: 'test-secret',
    DATABASE_CONNECTION_URI: 'postgres://localhost/test',
});
```

</codeExample>

<importantToKnow>
**Use dependency injection over direct imports** - this enables better testing, modularity, and follows the architectural pattern used throughout the codebase.

**Configuration is singleton and immutable** - parsed once at startup, runtime changes require restart.

**Critical environment variables** that will throw ParseError if missing:

-   `LIGHTDASH_SECRET` - Required for session management
-   Database connection URI - Required for production operation

**Security constraints**:

-   iframe embedding requires `SECURE_COOKIES=true`
-   JWT certificates support both file paths and base64-encoded PEM content
-   Content Security Policy configurable for embedding scenarios

**Scheduler task filtering** - cannot set both include AND exclude task lists simultaneously.

**Validation and error handling** - uses type-safe parsing with descriptive ParseError exceptions for invalid values. AI configuration uses Zod schemas with Sentry error capture.
</importantToKnow>

<links>
- @parseConfig.ts - Core parsing logic and LightdashConfig type definition
- @lightdashConfig.ts - Main configuration singleton export
- @aiConfigSchema.ts - Zod validation schema for AI features
- @lightdashConfig.mock.ts - Mock configuration for testing
</links>

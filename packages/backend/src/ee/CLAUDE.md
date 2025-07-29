# Enterprise Edition

## Summary

Enterprise Edition module providing commercial features including AI-powered analytics, dashboard embedding, SCIM integration, service accounts, and enhanced Slack functionality. License-gated features require valid Enterprise subscription for production use.

## How To Use

Enterprise features are automatically loaded when a valid license key is configured. The module extends the base application with additional services, models, and controllers while maintaining backward compatibility.

```typescript
// Enterprise features are initialized in index.ts
import { lightdashConfig } from '../config/lightdashConfig';

// License validation happens automatically on startup
if (lightdashConfig.license.licenseKey) {
    // Enterprise services are registered
    // AI services, embedding, SCIM, etc. become available
}

// Use enterprise services like any other service
const aiService = serviceRepository.getAiService();
const summary = await aiService.generateDashboardSummary(dashboardUuid);

const embedService = serviceRepository.getEmbedService();
const embedUrl = await embedService.createEmbedUrl(dashboard, options);
```

## Extension Mechanisms

The Enterprise Edition extends the base application using several patterns to add commercial features while maintaining backward compatibility:

### Provider Pattern

The core extension mechanism is a provider pattern implemented in `index.ts`. When a valid license is detected, the EE registers providers for services, models, and controllers:

```typescript
// From packages/backend/src/ee/index.ts
export async function getEnterpriseAppArguments(): Promise<EnterpriseAppArguments> {
    if (!lightdashConfig.license.licenseKey) {
        return {};
    }

    // License validation...

    return {
        serviceProviders: {
            embedService: ({ repository, context, models }) =>
                new EmbedService({
                    // dependencies...
                }),
            aiService: ({ repository, context, models }) =>
                new AiService({
                    // dependencies...
                }),
            // Other service providers...
        },
        modelProviders: {
            embedModel: ({ database }) =>
                new EmbedModel({
                    database,
                }),
            // Other model providers...
        },
        // Controller providers, middleware, etc.
    };
}
```

### Registration Process

1. On application startup, the EE module checks for a valid license
2. If valid, it registers enterprise providers for services, models, and controllers
3. The application uses these providers to create instances when needed
4. If no license is present, the application falls back to base implementations

This architecture allows the EE to seamlessly extend the base application while maintaining complete backward compatibility.

## Code Examples

```typescript
// Example: AI-powered dashboard summary
const aiService = serviceRepository.getAiService();
const summary = await aiService.generateDashboardSummary({
    dashboardUuid: 'dash-123',
    organizationUuid: 'org-456',
    userUuid: 'user-789',
});

// Example: Dashboard embedding with JWT
const embedService = serviceRepository.getEmbedService();
const embedToken = await embedService.createEmbedToken({
    content: {
        dashboardUuid: 'dash-123',
        dashboardFiltersInteractivity: 'enabled',
    },
    user: {
        email: 'embed-user@client.com',
        externalId: 'external-123',
    },
});

// Example: SCIM user provisioning
const scimService = serviceRepository.getScimService();
await scimService.createUser({
    userName: 'new.user@company.com',
    emails: [{ value: 'new.user@company.com', primary: true }],
    active: true,
});

// Example: Service account for API access
const serviceAccountService = serviceRepository.getServiceAccountService();
const serviceAccount = await serviceAccountService.createServiceAccount({
    name: 'Analytics API',
    organizationUuid: 'org-456',
    scopes: ['read:dashboards', 'write:charts'],
});
```

## Important To Know

-   Requires valid Enterprise license from Keygen.sh for production use (24-hour cache)
-   License validation happens on startup - invalid licenses prevent enterprise feature loading
-   Source Available License allows development/testing without subscription
-   AI features support multiple LLM providers: OpenAI, Anthropic Claude, Azure OpenAI
-   Dashboard embedding uses JWT authentication with configurable user attributes
-   SCIM integration enables automated user provisioning/deprovisioning for enterprise SSO
-   Service accounts provide API access with fine-grained permission scopes
-   All enterprise features are feature-flagged and can be toggled per organization
-   Commercial Slack integration includes AI agents for interactive data exploration
-   Database schema extensions add numerous tables for enterprise functionality
-   Maintains complete backward compatibility with open-source installation

## Links

-   `/packages/backend/src/ee/LICENSE` - Enterprise license terms and conditions
-   `/packages/backend/src/ee/clients/License/LicenseClient.ts` - License validation implementation
-   `/packages/backend/src/ee/services/AiService/` - AI-powered analytics and insights
-   `/packages/backend/src/ee/services/EmbedService/` - Dashboard embedding functionality

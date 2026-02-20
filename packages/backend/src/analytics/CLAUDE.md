<summary>
Analytics tracking system for Lightdash user interactions and system events. Provides a wrapper around RudderStack analytics to track business intelligence events with type safety and conditional tracking based on configuration.
</summary>

<howToUse>
The main entry point is the `LightdashAnalytics` class which extends RudderStack's analytics SDK. Initialize it with your configuration and use it to track user events throughout the application.

```typescript
import { LightdashAnalytics } from './analytics/LightdashAnalytics';

// Initialize analytics
const analytics = new LightdashAnalytics({
    lightdashConfig,
    writeKey: 'your-rudder-key',
    dataPlaneUrl: 'your-data-plane-url',
});

// Track user events
analytics.track({
    event: 'query.executed',
    userId: 'user-123',
    properties: {
        context: QueryExecutionContext.API,
        organizationId: 'org-123',
        projectId: 'project-123',
        metricsCount: 5,
        dimensionsCount: 3,
    },
});

// Track from account context (recommended)
analytics.trackAccount(account, {
    event: 'saved_chart.created',
    properties: {
        projectId: 'project-123',
        chartType: ChartType.CARTESIAN,
    },
});
```

</howToUse>

<codeExample>

```typescript
// Example: Track query execution with metrics
analytics.track({
    event: 'query.executed',
    userId: user.userUuid,
    properties: {
        context: QueryExecutionContext.CHART,
        organizationId: organization.organizationUuid,
        projectId: project.projectUuid,
        metricsCount: query.metrics.length,
        dimensionsCount: query.dimensions.length,
        chartId: chart.uuid,
    },
});

// Example: Track user creation
analytics.track({
    event: 'user.created',
    properties: {
        context: 'registration',
        createdUserId: newUser.userUuid,
        organizationId: organization?.organizationUuid,
        userConnectionType: 'password',
    },
});
```

</codeExample>

<importantToKnow>
- Analytics tracking is disabled if `lightdashConfig.rudder.writeKey` is not configured
- All events are prefixed with `lightdash_server.` in the analytics platform
- The system automatically handles anonymization for users with tracking disabled
- Use `trackAccount()` method when you have account context - it automatically extracts user/org IDs
- `userId` is set for registered users (account.user.id), while `anonymousId` is used for embed users
- For embed users, `anonymousId` is set to 'embed' and `externalId` is stored in properties
- The `analyticsMock` export is for testing - it has tracking disabled
- Event types are strictly typed - unknown events will cause TypeScript errors
- Special handling exists for user verification and update events to respect privacy settings
</importantToKnow>

<links>
@/packages/backend/src/config/lightdashConfig.ts - Configuration for analytics settings
@/packages/common/src/types/analytics.ts - Shared analytics type definitions
</links>

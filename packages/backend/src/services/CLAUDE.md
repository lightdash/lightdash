<summary>
The services directory contains the core business logic of the Lightdash backend. Services are responsible for implementing application features, orchestrating operations across multiple models, and enforcing business rules. Each service focuses on a specific domain of functionality (users, projects, dashboards, etc.) and follows a consistent pattern.
</summary>

<howToUse>
Services follow a dependency injection pattern and are accessed through the ServiceRepository:

1. Services are typically not instantiated directly but accessed through the ServiceRepository:

```typescript
// In a controller
const userService = serviceRepository.getUserService();
const projectService = serviceRepository.getProjectService();
```

2. All services extend the BaseService class which provides common functionality like logging:

```typescript
export class MyCustomService extends BaseService {
    constructor(dependencies) {
        super({ serviceName: 'MyCustomService' });
        // Initialize dependencies
    }
}
```

3. Services typically accept their dependencies through the constructor:

```typescript
constructor({
  lightdashConfig,
  analytics,
  userModel,
  projectModel,
  // other dependencies
}) {
  super({ serviceName: 'MyService' });
  this.lightdashConfig = lightdashConfig;
  this.analytics = analytics;
  this.userModel = userModel;
  this.projectModel = projectModel;
}
```

</howToUse>

<codeExample>
Example of using a service to perform a business operation:

```typescript
// Get a service from the repository
const userService = serviceRepository.getUserService();

// Use the service to perform an operation
try {
    const user = await userService.loginWithPassword(
        'user@example.com',
        'password123',
    );
    // Handle successful login
} catch (error) {
    // Handle authentication error
}
```

Example of creating a new service:

```typescript
export class MyNewService extends BaseService {
    private userModel: UserModel;
    private config: LightdashConfig;

    constructor({
        userModel,
        lightdashConfig,
    }: {
        userModel: UserModel;
        lightdashConfig: LightdashConfig;
    }) {
        super({ serviceName: 'MyNewService' });
        this.userModel = userModel;
        this.config = lightdashConfig;
    }

    async performOperation(user: SessionUser, data: any): Promise<Result> {
        this.logger.info(`User ${user.userUuid} performing operation`);
        // Implement business logic
        // Call models to persist data
        const result = { success: true };
        return result;
    }
}
```

</codeExample>

<importantToKnow>
- Services are responsible for business logic, while models handle data persistence.
- Services should validate inputs and enforce access control before performing operations.
- Use the logger provided by BaseService for consistent logging across services.
- Services should throw appropriate errors from @lightdash/common when operations fail.
- The ServiceRepository manages service instantiation and dependency injection.
- Services are typically stateless - they don't store state between method calls.
- When adding a new service, you must register it in ServiceRepository.ts.

Common service dependencies:

-   Models: For data persistence (UserModel, ProjectModel, etc.)
-   Config: Application configuration (lightdashConfig)
-   Analytics: For tracking events (analytics)
-   Other services: For complex operations that span multiple domains
    </importantToKnow>

<links>
- Service architecture overview: @/packages/backend/src/services/ServiceRepository.ts
- Base service class: @/packages/backend/src/services/BaseService.ts
- Example services:
  - @/packages/backend/src/services/UserService.ts
  - @/packages/backend/src/services/ProjectService/ProjectService.ts
  - @/packages/backend/src/services/DashboardService/DashboardService.ts
</links>

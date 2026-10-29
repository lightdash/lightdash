<summary>
Express middleware collection for authentication, account management, deprecation warnings, and Sentry error tracking. Provides session and JWT-based authentication with automatic account creation and request enrichment.
</summary>

<howToUse>
Middlewares are typically registered in Express routes or globally in the application. Import specific middleware functions and apply them to routes that require authentication or special handling.

```typescript
import { sessionAccountMiddleware } from './middlewares/accountMiddleware';
import { jwtAuthMiddleware } from './middlewares/jwtAuthMiddleware';
import { deprecatedDownloadCsvRoute } from './middlewares/deprecation';

// Apply session account middleware globally
app.use(sessionAccountMiddleware);

// Apply JWT auth for embed routes
app.use('/embed/*', jwtAuthMiddleware);

// Apply deprecation warning to specific routes
app.get(
    '/api/v1/download-csv/:chartId',
    deprecatedDownloadCsvRoute,
    downloadController.legacy,
);

// Middleware will populate req.account automatically
app.get('/api/v1/projects', (req, res) => {
    if (req.account?.isAuthenticated()) {
        // Access authenticated user
        const userId = req.account.user.id;
    }
});
```

</howToUse>

<codeExample>

```typescript
// Example: Route with session authentication
app.get(
    '/api/v1/projects/:projectUuid/charts',
    sessionAccountMiddleware, // Creates account from session
    async (req, res) => {
        // req.account is now populated with user info and abilities
        const userCanView = req.account.user.ability.can('view', 'SavedChart');

        if (!userCanView) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const charts = await getCharts(req.params.projectUuid);
        res.json(charts);
    },
);

// Example: Embed route with JWT authentication
app.get(
    '/embed/projects/:projectUuid/dashboards/:dashboardUuid',
    jwtAuthMiddleware, // Validates JWT and creates anonymous account
    async (req, res) => {
        // JWT middleware populates req.account for anonymous users
        const dashboardId = req.account.access?.dashboardId;
        const canInteractWithFilters = req.account.access?.filtering;

        if (dashboardId !== req.params.dashboardUuid) {
            return res
                .status(403)
                .json({ error: 'Token not valid for this dashboard' });
        }

        const dashboard = await getDashboard(dashboardId);
        res.json(dashboard);
    },
);

// Example: Deprecation middleware usage
app.get(
    '/api/v1/old-endpoint',
    deprecatedDownloadCsvRoute, // Warns about deprecation
    legacyController.handleOldEndpoint,
);
```

</codeExample>

<importantToKnow>
- sessionAccountMiddleware creates Account objects from Express session data with helper methods
- jwtAuthMiddleware handles embed token validation and creates anonymous accounts for embed users
- JWT middleware parses project UUID from URL path when not in query parameters
- Account objects include CASL abilities for authorization and helper methods like isAuthenticated()
- Deprecation middleware logs warnings and tracks usage of deprecated endpoints
- Sentry middleware automatically captures and reports errors with request context
- JWT middleware supports admin preview mode where authenticated users can view embed content
- Account middleware is idempotent - won't overwrite existing req.account
- All middlewares include proper error handling with appropriate HTTP status codes
- JWT tokens are validated against organization secrets and include dashboard-specific permissions
</importantToKnow>

<links>
@/packages/backend/src/auth/account/ - Account creation and management utilities
@/packages/backend/src/auth/lightdashJwt.ts - JWT token validation and decoding
@/packages/backend/src/controllers/authentication/ - Authentication controller utilities
@/packages/backend/src/middlewares/sentry.ts - Sentry error tracking middleware
</links>

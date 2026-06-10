<summary>
Backend API controllers built with TSOA that handle HTTP requests and generate OpenAPI specs. Controllers extend BaseController for dependency injection and use decorators for routing, authentication, and documentation. The module contains v1 controllers for existing APIs and v2 controllers for newer async/streaming endpoints.
</summary>

<howToUse>
Controllers are automatically registered by TSOA and accessible at their defined routes. All controllers extend BaseController and use dependency injection:

Key patterns:

- Use `@Middlewares([allowApiKeyAuthentication, isAuthenticated])` for protected endpoints
- Return `{status: 'ok', results: T}` for success responses
- Access services via `this.services.get{Service}Service()`
- Set HTTP status with `this.setStatus(201)` for non-200 responses
- Pass `req.account` to services. Add `assertRegisteredAccount(req.account)` as the first line of any handler that does not intentionally serve embed/JWT traffic. See `docs/account-patterns.md`.
  </howToUse>

<codeExample>

```typescript
// Basic CRUD controller
import { assertRegisteredAccount } from '@lightdash/common';

@Route('/api/v1/projects')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectController extends BaseController {
    /**
     * Retrieves all charts within a project's spaces
     * @summary List charts
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}/charts')
    @OperationId('listCharts')
    async getCharts(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() includePrivate?: boolean,
    ): Promise<ApiGetCharts> {
        assertRegisteredAccount(req.account);
        const charts = await this.services
            .getSavedChartService()
            .getAllSpaces(req.account, projectUuid, includePrivate);
        return {
            status: 'ok',
            results: charts,
        };
    }

    /**
     * Creates a new chart in the specified project
     * @summary Create chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/{projectUuid}/charts')
    @SuccessResponse('201', 'Created')
    async createChart(
        @Path() projectUuid: string,
        @Body() body: CreateSavedChart,
        @Request() req: express.Request,
    ): Promise<ApiCreateSavedChart> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        const chart = await this.services
            .getSavedChartService()
            .createSavedChart(req.account, projectUuid, body);
        return {
            status: 'ok',
            results: chart,
        };
    }
}
```

</codeExample>

<importantToKnow>
**Authentication Middleware:**
- `allowApiKeyAuthentication` - Enables both session and API key auth
- `isAuthenticated` - Requires active authenticated user
- `unauthorisedInDemo` - Blocks actions in demo mode

**Controller Organization:**

- V1 controllers: `/api/v1/` routes with existing patterns
- V2 controllers: `/api/v2/` routes with async/streaming support
- Authentication logic in `@authentication/` subdirectory

**Key Conventions:**

- All controllers extend `BaseController` for service injection
- Use TSOA decorators for OpenAPI generation and routing
- Services accessed via `this.services.get{Service}Service()`
- Consistent response format: `{status: 'ok', results: T}`
- Authenticated caller available as `req.account`. Narrow with `assertRegisteredAccount(req.account)` for registered-only endpoints. `req.user!` is the legacy shape — see `docs/account-patterns.md`.
- All endpoints must have JSDoc comments with description first, then `@summary` tag (2-3 words)

**V2 Differences:**

- Focus on async operations and result streaming
- Cleaner RESTful API design
- Enhanced error handling patterns

**Critical Business Logic:**

- Project permissions enforced through service layer
- Organization membership required for most operations
- Demo mode restrictions applied via middleware
- API keys and sessions both supported for authentication

</importantToKnow>

## Deprecating Endpoints

**What:** This applies to HTTP endpoints only. Internal service/model methods,
type fields, DB columns, and config fields are not endpoints — mark them with a
`@deprecated` JSDoc comment but do not add deprecation middleware.

**When:** Only deprecate an endpoint once nothing first-party calls it anymore —
the frontend, CLI, and other internal consumers must already be migrated off it.
A deprecated endpoint is removed 3 months after it was deprecated by default.
That window is the `getDeprecatedRouteMiddleware` default; override it only when a
different sunset date has been agreed.

**How:** Add `getDeprecatedRouteMiddleware(deprecatedOn, { suffixMessage })` to
the endpoint's `@Middlewares([...])`, where `deprecatedOn` is the date the
endpoint was deprecated and `suffixMessage` names the replacement. Keep the TSOA
`@Deprecated()` decorator and the `@deprecated` JSDoc (they drive OpenAPI).

```typescript
@Middlewares([
    allowApiKeyAuthentication,
    isAuthenticated,
    getDeprecatedRouteMiddleware(new Date('2025-08-26'), {
        suffixMessage: 'Use ProjectRoleAssignments instead.',
    }),
])
@Deprecated()
@Patch('{projectUuid}/access/{userUuid}')
```

**Behavior** (`authentication/deprecation.ts`):

- Every call logs. It logs a warning, escalating to an error once the removal
  date is within two weeks or has passed. Deprecated endpoints are not expected
  to be called by any first-party client, so any log line is a signal that
  something still depends on a route slated for removal.
- When it escalates to an error, it also reports a `DeprecatedRouteError`
  (`@lightdash/common`) to Sentry so overdue routes surface in alerting.
- Responses carry `Deprecation` (deprecation date), `Sunset` (removal date), and
  a legacy `Warning` header.

<links>
@packages/backend/src/controllers/baseController.ts - Base controller implementation
@packages/backend/src/controllers/authentication/index.ts - Authentication strategies
@packages/backend/src/controllers/userController.ts - User management example
@packages/backend/src/controllers/projectController.ts - Complex resource controller
@packages/backend/src/controllers/v2/ - V2 API controllers with async patterns
@docs/account-patterns.md - Patterns for `req.account`, `assertRegisteredAccount`, `RegisteredAccount` vs `SessionUser`
</links>

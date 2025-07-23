<summary>
Backend API controllers built with TSOA that handle HTTP requests and generate OpenAPI specs. Controllers extend BaseController for dependency injection and use decorators for routing, authentication, and documentation. The module contains v1 controllers for existing APIs and v2 controllers for newer async/streaming endpoints.
</summary>

<howToUse>
Controllers are automatically registered by TSOA and accessible at their defined routes. All controllers extend BaseController and use dependency injection:

```typescript
export class MyController extends BaseController {
    @Route('/api/v1/my-resource')
    @Tags('MyResource')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/{id}')
    @SuccessResponse('200', 'Success')
    @Response<ApiErrorPayload>('default', 'Error')
    async getResource(@Path() id: string): Promise<ApiSuccessEmpty> {
        const result = await this.services.getMyService().getById(id);
        return {
            status: 'ok',
            results: result,
        };
    }
}
```

Key patterns:

-   Use `@Middlewares([allowApiKeyAuthentication, isAuthenticated])` for protected endpoints
-   Return `{status: 'ok', results: T}` for success responses
-   Access services via `this.services.get{Service}Service()`
-   Set HTTP status with `this.setStatus(201)` for non-200 responses
    </howToUse>

<codeExample>
```typescript
// Basic CRUD controller
@Route('/api/v1/projects')
@Tags('Projects')
export class ProjectController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/{projectUuid}/charts')
    @OperationId('listCharts')
    async getCharts(
        @Path() projectUuid: string,
        @Query() includePrivate?: boolean,
        @Request() req: express.Request,
    ): Promise<ApiGetCharts> {
        const charts = await this.services
            .getSavedChartService()
            .getAllSpaces(req.user!, projectUuid, includePrivate);
        return {
            status: 'ok',
            results: charts,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/{projectUuid}/charts')
    @SuccessResponse('201', 'Created')
    async createChart(
        @Path() projectUuid: string,
        @Body() body: CreateSavedChart,
        @Request() req: express.Request,
    ): Promise<ApiCreateSavedChart> {
        this.setStatus(201);
        const chart = await this.services
            .getSavedChartService()
            .createSavedChart(req.user!, projectUuid, body);
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
- User object available as `req.user!` in authenticated endpoints

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

<links>
@packages/backend/src/controllers/baseController.ts - Base controller implementation
@packages/backend/src/controllers/authentication/index.ts - Authentication strategies
@packages/backend/src/controllers/userController.ts - User management example
@packages/backend/src/controllers/projectController.ts - Complex resource controller
@packages/backend/src/controllers/v2/ - V2 API controllers with async patterns
</links>
```

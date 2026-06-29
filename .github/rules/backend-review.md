# Backend review rules

Applies to `packages/backend/**/*.ts`.

## Architecture Overview

The backend follows a layered architecture pattern with clear separation of concerns:

```
controllers -> services -> models -> database
```

### Key Performance Considerations

1. **Database Operations**
   - Use appropriate indexes for frequently queried columns
   - Implement query optimization for large datasets
   - Leverage database connection pooling (using `pg`)
   - Consider materialized views for complex aggregations
   - Use batch operations for bulk data operations — `batchInsert` where it makes sense

2. **API Performance**
   - Use pagination for large result sets — see `packages/common/src/types/paginateResults.ts`
   - Implement rate limiting for API endpoints
   - Keep API changes backwards compatible unless the endpoint was deprecated and past the sunset date

3. **Error handling and logging**
   - Look at `packages/backend/src/errors.ts` to categorise errors correctly. See `packages/backend/src/logging/winston.ts` and `packages/backend/src/sentry.ts` to see what errors are ignored in Sentry
   - If you can't find a suitable error class instance, create it

4. **Background Jobs**
   - Use `graphile-worker` for handling long-running tasks — see `packages/backend/src/SchedulerApp.ts` and `packages/backend/src/scheduler/SchedulerWorker.ts` to form your code
   - Implement proper job retry mechanisms if the default isn't sufficient
   - Monitor job queue performance
   - Ensure the necessary payload properties are set so errors can be filtered easily in Sentry — see `packages/backend/src/scheduler/SchedulerTaskTracer.ts`

## Development Guidelines

When building a new endpoint see `packages/backend/src/generated/routes.ts` and `packages/backend/src/generated/swagger.json`, ensure that you make changes to the controller, service, model, but also update types in `packages/common`. Remind the user to call `pnpm generate-api` to rebuild tsoa.

### Testing

Don't write unit tests that test implementation, only write unit tests for new business logic.
- Good tests: business logic, complex rules, nested conditionals
- Bad tests: database calls, implementation details, data transformation, prometheus usage

### Controllers
- Keep controllers thin — delegate business logic to services
- Implement proper request validation using `zod`
- Use TypeScript types for request/response
- Generate API documentation using `tsoa` — good example in `packages/backend/src/controllers/savedChartController.ts`

### Services
- Implement proper error handling and logging
- Use appropriate transaction management
- Implement proper authorization checks and figure out if project or organization should be the base of the permission

### Models
- Use the Knex query builder efficiently and strongly typed
- Implement proper database constraints
- Use appropriate data types for columns
- Implement proper indexing strategy

### Database
- Follow migration naming conventions — good example: `packages/backend/src/database/migrations/20250310151004_create_query_history_table.ts`
- Implement proper rollback strategies
- Use appropriate database constraints
- Implement proper indexing strategy
- Add types for the database entities

## Performance Monitoring

1. **Metrics Collection**
   - Use Prometheus metrics for monitoring
   - Track API response times
   - Monitor database query performance
   - Track background job execution times

2. **Logging**
   - Use structured logging with Winston
   - Implement proper log levels
   - Include relevant context in logs
   - Use appropriate log rotation

3. **Error Tracking**
   - Use Sentry for error tracking
   - Implement proper error categorization
   - Track error rates and patterns
   - Monitor error impact on performance

## Security & Authorization

- Use CASL for permission management
- Implement proper role-based access control
- All permission logic is written in `packages/common/src/authorization/organizationMemberAbility.ts` + `packages/common/src/authorization/projectMemberAbility.ts`
- All service methods must have permission checks
- Permission checks should use the `createAuditedAbility` method (instead of accessing `user.ability` / `account.user.ability` directly) — see `docs/audit-logging.md`
- Permission checks always execute against a subject using fields only from the subject
- Never insert user properties (including the user's org uuid) in the subject field
- Validate user permissions at the service level

## Code Style

- Prefer dependency injection over imports between files — enables better testing

## Dependencies

Key performance-related dependencies (see `packages/backend/package.json`):
- `graphile-worker`: background job processing
- `prom-client`: performance monitoring
- `winston`: structured logging
- `knex`: database operations
- `pg`: PostgreSQL operations

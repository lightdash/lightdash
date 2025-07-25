<summary>
Comprehensive logging system built on Winston with audit logging, performance measurement, CASL authorization tracking, and Sentry integration. Provides structured logging with custom levels and context-aware debugging capabilities.
</summary>

<howToUse>
The logging module provides the main Logger instance and various logging utilities. Import Logger for standard logging and use specialized functions for audit logs and performance measurement.

```typescript
import Logger from './logging/logger';
import { auditLog } from './logging/auditLog';
import { measureTime } from './logging/measureTime';
import { wrapCaslAuthorization } from './logging/caslAuditWrapper';

// Standard logging
Logger.info('User logged in', { userId: 'user-123' });
Logger.error('Database connection failed', { error: err.message });

// Performance measurement
const { result, durationMs } = await measureTime(
    () => database.query('SELECT * FROM projects'),
    'projects_query',
    Logger,
    { projectId: 'proj-123' },
);

// Audit logging for security events
auditLog({
    actor: { uuid: user.uuid, email: user.email },
    action: 'view',
    resource: { type: 'dashboard', uuid: dashboard.uuid },
    status: 'allowed',
});
```

</howToUse>

<codeExample>
```typescript
// Example: Wrap CASL authorization with audit logging
const authorizedService = wrapCaslAuthorization(
    myService,
    'MyService',
    (args) => ({
        actor: args.user,
        resource: { type: 'project', uuid: args.projectUuid }
    })
);

// Calls will be automatically audited
await authorizedService.updateProject(user, projectUuid, updates);

// Example: Measure and log database operation performance
const { result: charts, durationMs } = await measureTime(
async () => {
return await database('saved_charts')
.where('project_id', projectId)
.select('\*');
},
'fetch_project_charts',
Logger,
{ projectId, userId: user.uuid }
);

if (durationMs > 1000) {
Logger.warn('Slow chart query detected', {
projectId,
durationMs,
chartsCount: charts.length
});
}

// Example: Structured audit log with full context
auditLog({
id: uuidv4(),
timestamp: new Date().toISOString(),
actor: {
uuid: user.userUuid,
email: user.email,
organizationUuid: user.organizationUuid,
organizationRole: user.role
},
action: 'delete',
resource: {
type: 'saved_chart',
uuid: chartUuid,
name: chart.name,
organizationUuid: user.organizationUuid,
projectUuid: chart.projectUuid
},
status: 'allowed',
context: {
userAgent: req.headers['user-agent'],
ipAddress: req.ip,
method: req.method,
url: req.originalUrl
}
});

```
</codeExample>

<importantToKnow>
- Logger uses Winston with custom levels: error, warn, info, http, audit, debug
- Audit logs follow a structured schema with actor, action, resource, and status fields
- Performance measurement includes automatic logging with configurable thresholds
- CASL wrapper automatically audits authorization decisions (allowed/denied)
- Sentry integration provides trace IDs in logs for error correlation
- Express middleware automatically logs HTTP requests with timing
- Logs include execution context for request correlation across async operations
- Color-coded console output in development for better readability
- Audit logs are separate from application logs for compliance and security analysis
- Performance logs help identify slow operations and optimization opportunities
</importantToKnow>

<links>
@/packages/backend/src/config/lightdashConfig.ts - Logging configuration settings
@/packages/backend/src/middlewares/sentry.ts - Sentry middleware integration
@/packages/common/src/authorization/ability.ts - CASL authorization system
</links>
```

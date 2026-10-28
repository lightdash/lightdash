<summary>
Comprehensive logging system built on Winston with audit logging, performance measurement, CASL authorization tracking, and Sentry integration. Provides structured logging with custom levels and context-aware debugging capabilities.
</summary>

<howToUse>
The logging module provides the main Logger instance and various logging utilities. Import Logger for standard logging and use specialized functions for audit logs and performance measurement.

```typescript
import Logger from './logging/logger';
import { createAuditLogEvent } from './logging/auditLog';
import { logAuditEvent } from './logging/winston';
import { measureTime } from './logging/measureTime';
import { CaslAuditWrapper } from './logging/caslAuditWrapper';

// Standard logging
Logger.info('User logged in', { userId: 'user-123' });
Logger.error('Database connection failed', { error: err.message });
```

</howToUse>

<codeExample>

```typescript
// Example: Use CASL authorization with audit logging (as in DashboardService)
const auditedAbility = new CaslAuditWrapper(user.ability, user, {
    auditLogger: logAuditEvent,
});

// Permissions will be automatically audited
if (auditedAbility.cannot('view', subject('Dashboard', dashboard))) {
    throw new ForbiddenError(
        "You don't have access to the space this dashboard belongs to",
    );
}

// Example: Performance measurement
const { result, durationMs } = await measureTime(
    () => database.query('SELECT * FROM projects'),
    'projects_query',
    Logger,
    { projectId: 'proj-123' },
);
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

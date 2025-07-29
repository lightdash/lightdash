<summary>
Background job processing system built on Graphile Worker for scheduled deliveries, project compilation, validation, and data export tasks. Handles email, Slack, Google Sheets notifications with timeout management and task orchestration.
</summary>

<howToUse>

The scheduler system consists of SchedulerWorker (job runner) and SchedulerTask (job logic). Jobs are queued through SchedulerClient and processed asynchronously with proper timeout handling.

```typescript
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { SchedulerClient } from './scheduler/SchedulerClient';

// Start the background worker
const worker = new SchedulerWorker({
    lightdashConfig,
    analytics,
    unfurlService,
    // ... other dependencies
});
await worker.run();

// Queue a scheduled delivery job
const schedulerClient = new SchedulerClient({ lightdashConfig });
await schedulerClient.addJob('handleScheduledDelivery', {
    scheduledDeliveryId: 'delivery-123',
    schedulerId: 'scheduler-456',
});

// Queue a project compilation job
await schedulerClient.addJob('compileProject', {
    createdByUserUuid: user.uuid,
    organizationUuid: org.uuid,
    projectUuid: project.uuid,
});
```

</howToUse>

<codeExample>

```typescript
// Example: Queue the main scheduled delivery task
await schedulerClient.scheduleTask(
    SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
    schedulerPayload,
    JobPriority.NORMAL,
    3,
);

// Example: Queue multiple notification types with real targets
await schedulerClient.generateJobsForSchedulerTargets(
    scheduledTime,
    scheduler,
    page,
    parentJobId,
    traceProperties,
);

// Example: Compile a project
await schedulerClient.compileProject({
    organizationUuid,
    projectUuid,
    userUuid,
    schedulerUuid,
    createdByUserUuid,
    requestMethod,
    jobUuid,
    isPreview,
});
```

</codeExample>

<importantToKnow>

-   Built on Graphile Worker for PostgreSQL-based job queuing with ACID guarantees
-   All tasks are wrapped with tryJobOrTimeout to prevent hung processes and unlock workers
-   SchedulerTask contains the business logic while SchedulerWorker manages job execution
-   Scheduled deliveries support multiple targets: email, Slack, Google Sheets, Microsoft Teams
-   Google Sheets uploads bypass image/PDF generation and directly query warehouse data
-   Project compilation jobs handle dbt project validation and explore generation
-   Event emitter system allows monitoring job lifecycle and worker status
-   Task tracing provides performance monitoring and debugging capabilities
-   Worker respects lightdashConfig.scheduler.tasks to enable/disable specific job types
-   Cron job automatically generates daily scheduled delivery jobs
-   Analytics tracking integrated for all scheduler operations
-   Proper error handling with Sentry integration and detailed logging

</importantToKnow>

<links>
@/packages/backend/src/scheduler/README.md - Detailed task explanations and workflow
@/packages/backend/src/clients/ - Email, Slack, and Google Drive clients used by tasks
@/packages/common/src/types/scheduler.ts - Scheduler type definitions and payloads
@/packages/backend/src/config/lightdashConfig.ts - Scheduler configuration settings
</links>

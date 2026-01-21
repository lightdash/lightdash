# Scheduled Delivery Email System - Technical Research

**Research Date**: 2026-01-21
**Purpose**: Document current state of scheduled delivery emails for unsubscribe feature (PROD-2592)

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Models (Data Access Layer)](#2-models-data-access-layer)
3. [Services (Business Logic)](#3-services-business-logic)
4. [Scheduler Execution (Background Jobs)](#4-scheduler-execution-background-jobs)
5. [Email Client](#5-email-client)
6. [Recipients Management](#6-recipients-management)
7. [API Endpoints](#7-api-endpoints)
8. [Current Unsubscribe Status](#8-current-unsubscribe-status)
9. [Code Flow Diagram](#9-code-flow-diagram)
10. [Key Files Reference](#10-key-files-reference)

---

## 1. Database Schema

### Primary Tables

**Location**: `packages/backend/src/database/entities/scheduler.ts`

#### `scheduler` - Core scheduler configuration

| Column | Type | Description |
|--------|------|-------------|
| `scheduler_uuid` | UUID | Primary key |
| `name` | string | Display name |
| `format` | enum | CSV, XLSX, IMAGE, GSHEETS |
| `cron` | string | Cron expression for scheduling |
| `timezone` | string | Optional timezone override |
| `saved_chart_uuid` | UUID | FK to saved charts (nullable) |
| `dashboard_uuid` | UUID | FK to dashboards (nullable) |
| `created_by` | UUID | User who created it |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |
| `enabled` | boolean | Whether scheduler is active |
| `message` | string | Optional custom message in email |
| `options` | JSONB | Format-specific options |
| `filters` | JSONB | Dashboard filters |
| `parameters` | JSONB | Dashboard parameters |
| `include_links` | boolean | Include links in email |
| `notification_frequency` | enum | ALWAYS or ONCE |
| `selected_tabs` | array | Dashboard tab selection |
| `thresholds` | JSONB | Threshold alert configuration |

#### `scheduler_email_target` - Email recipients

| Column | Type | Description |
|--------|------|-------------|
| `scheduler_email_target_uuid` | UUID | Primary key |
| `scheduler_uuid` | UUID | FK to scheduler |
| `recipient` | string | Email address |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |

#### `scheduler_slack_target` - Slack channel targets

| Column | Type | Description |
|--------|------|-------------|
| `scheduler_slack_target_uuid` | UUID | Primary key |
| `scheduler_uuid` | UUID | FK to scheduler |
| `channel` | string | Slack channel ID |

#### `scheduler_msteams_target` - Microsoft Teams webhook targets

| Column | Type | Description |
|--------|------|-------------|
| `scheduler_msteams_target_uuid` | UUID | Primary key |
| `scheduler_uuid` | UUID | FK to scheduler |
| `webhook` | string | Webhook URL |

#### `scheduler_log` - Execution history

| Column | Type | Description |
|--------|------|-------------|
| `job_id` | string | Unique job identifier |
| `job_group` | string | Groups parent job with child jobs |
| `scheduler_uuid` | UUID | Which scheduler was executed |
| `task` | string | Task name (e.g., SEND_EMAIL_NOTIFICATION) |
| `status` | enum | SCHEDULED, STARTED, COMPLETED, ERROR |
| `target` | string | Email/channel that received notification |
| `target_type` | enum | email, slack, msteams, gsheets |
| `scheduled_time` | timestamp | When it was supposed to run |
| `created_at` | timestamp | When log was created |
| `details` | JSONB | Detailed result information |

### Relevant Migrations

| Migration File | Purpose |
|----------------|---------|
| `20230206192228_add_scheduler_tables.ts` | Initial scheduler tables |
| `20230214121410_add_scheduler_email_table.ts` | Email target table |
| `20241113104144_add_scheduled_delivery_include_links.ts` | Add include_links column |

---

## 2. Models (Data Access Layer)

**Location**: `packages/backend/src/models/SchedulerModel/index.ts`

### Key Methods

#### Scheduler CRUD

```typescript
getAllSchedulers(): Promise<SchedulerDb[]>
// Get all enabled schedulers for active users

getSchedulersWithTargets(schedulers: SchedulerDb[]): Promise<SchedulerWithTargets[]>
// Fetch targets for multiple schedulers

getSchedulerAndTargets(schedulerUuid: string): Promise<SchedulerAndTargets>
// Get complete scheduler with all targets

getSchedulerForProject(projectUuid: string): Promise<SchedulerWithTargets[]>
// Get schedulers for a project

createScheduler(newScheduler: CreateSchedulerAndTargets): Promise<SchedulerAndTargets>
// Create new scheduler with targets (transactional)

updateScheduler(scheduler: UpdateSchedulerAndTargets): Promise<SchedulerAndTargets>
// Update existing scheduler and targets

deleteScheduler(schedulerUuid: string): Promise<void>
// Delete scheduler and cascade delete targets
```

#### Logging

```typescript
logSchedulerJob(log: SchedulerLogInput): Promise<void>
// Record execution history

getSchedulerLogs(projectUuid, filters, pagination): Promise<PaginatedSchedulerLogs>
// Paginated query of execution logs

getSchedulerRuns(projectUuid, filters, pagination): Promise<PaginatedSchedulerRuns>
// Aggregated view of scheduler runs with child job counts

getRunLogs(runId: string): Promise<SchedulerLog[]>
// Get detailed logs for a specific run
```

---

## 3. Services (Business Logic)

**Location**: `packages/backend/src/services/SchedulerService/SchedulerService.ts`

### Responsibilities

- Permission checking (CASL-based authorization)
- Resource validation (chart or dashboard exists)
- Scheduler creation/update/deletion with validation
- Timezone management and CRON adjustment
- Test scheduler execution (send now)
- Google Sheets error notification
- Scheduler ownership reassignment
- Validation of scheduler frequency and timezone

### Key Methods

```typescript
createScheduler(user, projectUuid, scheduler): Promise<SchedulerAndTargets>
// Create with permission check

updateScheduler(user, schedulerUuid, scheduler): Promise<SchedulerAndTargets>
// Update with permission check

deleteScheduler(user, schedulerUuid): Promise<void>
// Delete with permission check

getScheduler(user, schedulerUuid): Promise<SchedulerAndTargets>
// Get single scheduler

getSchedulers(user, projectUuid, pagination, filters): Promise<PaginatedSchedulers>
// List schedulers with filters

testScheduler(user, schedulerUuid): Promise<void>
// Send now (immediate delivery)

setSchedulerEnabled(user, schedulerUuid, enabled): Promise<SchedulerAndTargets>
// Toggle enabled state

getSchedulerLogs(user, projectUuid, filters): Promise<PaginatedLogs>
// Get execution logs

getSchedulerRuns(user, projectUuid, filters): Promise<PaginatedRuns>
// Get aggregated runs
```

### Permission Model

- Uses CASL (authorization) via ability `manage` on `ScheduledDeliveries` subject
- Checks against organization/project of resource
- Admin can manage any scheduler
- Non-admins can only manage their own schedulers

---

## 4. Scheduler Execution (Background Jobs)

**Location**: `packages/backend/src/scheduler/`

### Architecture Components

| File | Purpose |
|------|---------|
| `SchedulerWorker.ts` | Job runner that processes queued jobs |
| `SchedulerTask.ts` | Contains execution logic for all scheduler jobs |
| `SchedulerClient.ts` | Queues jobs to be processed |

### Job Flow

```
1. SchedulerClient.scheduleTask() queues job
   ↓
2. SchedulerWorker picks up job and calls appropriate method in SchedulerTask
   ↓
3. For scheduled deliveries:
   - handleScheduledDelivery() - Main orchestrator
     - Generates page data (images/CSVs)
     - Creates child jobs for each target
   - sendEmailNotification() - Sends to email recipient
   - sendSlackNotification() - Sends to Slack channel
   - sendMsTeamsNotification() - Sends to Teams webhook
   - uploadGsheets() - Uploads to Google Sheets
```

### Key Methods in SchedulerTask

**Location**: `packages/backend/src/scheduler/SchedulerTask.ts`

#### `handleScheduledDelivery(payload)`

Main entry point for scheduled delivery execution:

1. Validates scheduler exists and is enabled
2. Gets page data (screenshot, CSV, etc.)
3. Queues notification tasks for each target
4. Logs job status

#### `sendEmailNotification(jobId, notification)`

Sends email to a single recipient:

1. Validates email recipient
2. Determines format type (IMAGE, CSV, XLSX)
3. Calls appropriate EmailClient method
4. Handles threshold alerts
5. Logs success/failure

#### `getNotificationPageData(scheduler, jobId)`

Generates content for delivery:

1. Executes queries for CSV/XLSX
2. Takes screenshots for images
3. Handles dashboard/chart export
4. Returns file URLs and failures

### Job Priority

- Daily cron job generates scheduled delivery jobs
- Jobs are queued with LOW priority
- Tasks wrapped in `tryJobOrTimeout` to prevent hung processes

---

## 5. Email Client

**Location**: `packages/backend/src/clients/EmailClient/EmailClient.ts`

### Email Methods

```typescript
sendImageNotificationEmail(options): Promise<void>
// Dashboard/chart screenshot emails

sendChartCsvNotificationEmail(options): Promise<void>
// Chart CSV/XLSX emails

sendDashboardCsvNotificationEmail(options): Promise<void>
// Dashboard CSV/XLSX emails

sendScheduledDeliveryFailureEmail(options): Promise<void>
// Failure notifications to scheduler owner

sendScheduledDeliveryTargetFailureEmail(options): Promise<void>
// Partial delivery failures

sendGoogleSheetsErrorNotificationEmail(options): Promise<void>
// Google Sheets sync errors
```

### Configuration

- SMTP configuration via `lightdashConfig.smtp`
- Nodemailer with pooled connections (max 5 connections)
- Handlebars template support

### Retry Logic

- 3 attempts with exponential backoff
- Timeout handling:
  - Connection: 2 minutes
  - Greeting: 30 seconds
  - Socket: 3 minutes

### Email Templates

**Location**: `packages/backend/src/clients/EmailClient/templates/`

| Template | Purpose |
|----------|---------|
| `imageNotification.html` | Screenshot emails |
| `chartCsvNotification.html` | Chart CSV emails |
| `dashboardCsvNotification.html` | Dashboard CSV emails |
| `googleSheetsSyncDisabledNotification.html` | Sync error emails |

---

## 6. Recipients Management

### Storage

- Recipients stored in `scheduler_email_target` table
- One record per unique email address per scheduler
- Multiple email addresses supported (multiple targets)

### Recipient Operations

| Operation | Method |
|-----------|--------|
| Create | `SchedulerModel.createScheduler()` inserts email targets |
| Update | `SchedulerModel.updateScheduler()` handles add/update/delete |
| Delete | Cascading delete when scheduler is deleted |
| Query | `getSchedulersWithTargets()` fetches all recipients |

### Data Structure (API Response)

```typescript
type SchedulerEmailTarget = {
    schedulerEmailTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string;
    recipient: string; // email address
};
```

### Batch Email Sending

- `EmailBatchNotificationPayload` type supports multiple targets
- Each email sent individually (one job per recipient)
- Failure tracking per recipient in `scheduler_log`

---

## 7. API Endpoints

**Location**: `packages/backend/src/controllers/schedulerController.ts`

### Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/schedulers/{projectUuid}/list` | List all schedulers with pagination/filters |
| GET | `/api/v1/schedulers/{schedulerUuid}` | Get single scheduler with targets |
| POST | `/api/v1/schedulers` | Create new scheduler |
| PATCH | `/api/v1/schedulers/{schedulerUuid}` | Update scheduler and targets |
| PATCH | `/api/v1/schedulers/{schedulerUuid}/enabled` | Toggle scheduler enabled/disabled |
| PATCH | `/api/v1/schedulers/{projectUuid}/reassign-owner` | Reassign ownership to another user |
| DELETE | `/api/v1/schedulers/{schedulerUuid}` | Delete scheduler |
| GET | `/api/v1/schedulers/{projectUuid}/logs` | Get execution logs |
| GET | `/api/v1/schedulers/{projectUuid}/runs` | Get aggregated scheduler runs |
| GET | `/api/v1/schedulers/runs/{runId}/logs` | Get detailed run logs |
| POST | `/api/v1/schedulers/send` | Send chart/dashboard now |
| POST | `/api/v1/schedulers/{schedulerUuid}/send` | Send specific scheduler now |

### Request/Response Types

**Location**: `packages/common/src/types/scheduler.ts`

```typescript
CreateSchedulerAndTargets  // Create payload
UpdateSchedulerAndTargets  // Update payload
SchedulerAndTargets        // Response with targets
EmailNotificationPayload   // Email notification job payload
```

---

## 8. Current Unsubscribe Status

### Finding: NO UNSUBSCRIBE FUNCTIONALITY EXISTS

**Evidence**:

- No search results for "unsubscribe" in backend code
- No unsubscribe tables, columns, or migrations
- No unsubscribe links in email templates
- No recipient blocking/opt-out logic
- `SchedulerEmailTarget` has no `unsubscribed` or `opt_out` column
- Email sending directly to all recipients without checking subscription status

### Current Behavior

All email recipients receive all scheduled delivery emails. The only ways to stop receiving emails:

1. Delete the scheduler entirely
2. Disable the scheduler (`enabled = false`)
3. Remove email from targets (requires admin/owner action)
4. Delete user account

---

## 9. Code Flow Diagram

### Email Delivery Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Frontend creates scheduler with targets                          │
│    POST /api/v1/schedulers                                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. SchedulerService.createScheduler()                               │
│    - Validates permissions (CASL)                                   │
│    - Validates resource exists                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. SchedulerModel.createScheduler()                                 │
│    - INSERT into scheduler table                                    │
│    - INSERT into scheduler_email_target for each recipient          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Cron Job (daily)                                                 │
│    - SchedulerWorker generates scheduled delivery jobs              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. SchedulerClient.scheduleTask()                                   │
│    - Queues handleScheduledDelivery task                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. SchedulerTask.handleScheduledDelivery()                          │
│    - Fetches scheduler + targets from DB                            │
│    - Generates page data (screenshots, CSVs)                        │
│    - For each email target: queues sendEmailNotification job        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. SchedulerTask.sendEmailNotification()                            │
│    - Calls EmailClient method based on format                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 8. EmailClient.sendChartCsvNotificationEmail() (or other format)    │
│    - Renders Handlebars template                                    │
│    - Sends via Nodemailer/SMTP                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 9. SchedulerModel.logSchedulerJob()                                 │
│    - Records success/failure in scheduler_log                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Key Files Reference

### Database Layer

| File | Lines | Purpose |
|------|-------|---------|
| `packages/backend/src/database/entities/scheduler.ts` | ~200 | Type definitions for all scheduler tables |
| `packages/backend/src/database/migrations/20230206192228_add_scheduler_tables.ts` | ~100 | Initial schema migration |
| `packages/backend/src/database/migrations/20230214121410_add_scheduler_email_table.ts` | ~50 | Email targets table migration |

### Backend

| File | Lines | Purpose |
|------|-------|---------|
| `packages/backend/src/models/SchedulerModel/index.ts` | ~1970 | Data access layer |
| `packages/backend/src/services/SchedulerService/SchedulerService.ts` | ~800 | Business logic & permissions |
| `packages/backend/src/scheduler/SchedulerTask.ts` | ~3700 | Email/Slack/Teams sending logic |
| `packages/backend/src/scheduler/SchedulerClient.ts` | ~500 | Job queuing |
| `packages/backend/src/scheduler/SchedulerWorker.ts` | ~400 | Job execution runner |
| `packages/backend/src/clients/EmailClient/EmailClient.ts` | ~800 | SMTP sending |
| `packages/backend/src/controllers/schedulerController.ts` | ~400 | API endpoints |

### Common (Types)

| File | Purpose |
|------|---------|
| `packages/common/src/types/scheduler.ts` | TypeScript types for all scheduler concepts |

### Frontend (For Reference)

| File | Purpose |
|------|---------|
| `packages/frontend/src/features/scheduler/` | Scheduler UI components |
| `packages/frontend/src/hooks/scheduler/` | Scheduler API hooks |

---

## Summary

Lightdash has a **mature, multi-target scheduled delivery system** with support for:

- Email, Slack, Microsoft Teams, and Google Sheets targets
- Multiple formats (CSV, XLSX, Images)
- Threshold-based alerts
- Comprehensive logging and history

However, it **lacks any unsubscribe/opt-out functionality**:

- All email delivery is push-only
- Recipients cannot opt-out without admin intervention
- No unsubscribe links in emails
- No per-recipient subscription status tracking

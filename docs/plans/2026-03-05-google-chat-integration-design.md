# Google Chat Integration - Design & Implementation Plan

**GitHub Issue**: https://github.com/lightdash/lightdash/issues/18267
**Linear**: PROD-947
**Date**: 2026-03-05

## Overview

Add Google Chat as a webhook-based notification destination for scheduled deliveries and threshold alerts, following the same pattern as the existing MS Teams integration.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth method | Incoming webhooks (no OAuth) | Same as MS Teams; customer already validated this works |
| Feature flag | `GOOGLE_CHAT_ENABLED` env var | Matches MS Teams pattern, controls cloud rollout |
| UI placement | Alongside MS Teams in scheduler form | Smallest delta, same pattern, improve UI later |
| Delivery formats | IMAGE, CSV/XLSX, threshold alerts | Full parity with MS Teams from day one |
| Webhook validation | Loose (`https://` + no whitespace) | Allows proxies/redirects; matches MS Teams approach |

## Architecture

The integration mirrors MS Teams exactly:

```
Scheduler Form (frontend)
  -> GoogleChatWebhookInput component
  -> scheduler_google_chat_target DB table
  -> SchedulerClient queues SEND_GOOGLE_CHAT_BATCH_NOTIFICATION job
  -> SchedulerTask.sendGoogleChatBatchNotification()
  -> GoogleChatClient.postImageWithWebhook() / postCsvWithWebhook()
  -> HTTP POST to Google Chat webhook URL with cardsV2 payload
```

## Google Chat Message Format

Google Chat uses `cardsV2` format (different from MS Teams Adaptive Cards):

```json
{
  "cardsV2": [{
    "cardId": "scheduled-delivery",
    "card": {
      "header": {
        "title": "Dashboard Title",
        "subtitle": "Lightdash Scheduled Delivery",
        "imageUrl": "https://...",
        "imageType": "CIRCLE"
      },
      "sections": [{
        "widgets": [
          { "image": { "imageUrl": "...", "altText": "..." } },
          { "textParagraph": { "text": "Description with **markdown**" } },
          { "buttonList": { "buttons": [{ "text": "Open in Lightdash", "onClick": { "openLink": { "url": "..." } } }] } }
        ]
      }]
    }
  }]
}
```

## Key Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `packages/backend/src/clients/GoogleChat/GoogleChatClient.ts` | Webhook client with card formatting |
| `packages/backend/src/database/migrations/XXXXXXXX_add-google-chat-scheduler-target.ts` | DB migration |
| `packages/frontend/src/features/scheduler/components/SchedulerForm/SchedulerFormGoogleChatInput.tsx` | Webhook URL input component |
| `packages/frontend/src/svgs/googlechat.svg` | Google Chat icon |

### Modified Files

| File | Change |
|------|--------|
| `packages/common/src/types/scheduler.ts` | Add `SchedulerGoogleChatTarget`, type guards, payload types |
| `packages/common/src/types/schedulerTaskList.ts` | Add `SEND_GOOGLE_CHAT_BATCH_NOTIFICATION` task |
| `packages/common/src/types/errors.ts` | Add `GoogleChatError` class |
| `packages/backend/src/config/parseConfig.ts` | Add `googleChat.enabled` config |
| `packages/backend/src/database/entities/scheduler.ts` | Add `SchedulerGoogleChatTargetDb` entity |
| `packages/backend/src/models/SchedulerModel/SchedulerModel.ts` | CRUD for google_chat targets |
| `packages/backend/src/scheduler/SchedulerClient.ts` | Queue google chat batch jobs |
| `packages/backend/src/scheduler/SchedulerTask.ts` | Handle google chat notification task |
| `packages/backend/src/scheduler/SchedulerWorker.ts` | Register new task handler |
| `packages/backend/src/clients/ClientRepository.ts` | Register GoogleChatClient |
| `packages/backend/src/controllers/schedulerController.ts` | Add `googlechat` filter option |
| `packages/frontend/src/features/scheduler/components/SchedulerForm/SchedulerForm.tsx` | Render GoogleChat input |
| `packages/frontend/src/features/scheduler/hooks/useSchedulerFilters.ts` | Add googlechat filter |
| `packages/frontend/src/features/scheduler/hooks/useLogsFilters.ts` | Add googlechat filter |

---

## Implementation Plan

### Phase 1: Common Types & Config

**Step 1.1 - Add common types**
- File: `packages/common/src/types/scheduler.ts`
  - Add `SchedulerGoogleChatTarget` type (mirrors `SchedulerMsTeamsTarget`: uuid, schedulerUuid, webhook, createdAt, updatedAt)
  - Add `CreateSchedulerGoogleChatTarget` and `UpdateSchedulerGoogleChatTarget`
  - Add `GoogleChatNotificationPayload` and `GoogleChatBatchNotificationPayload`
  - Add type guards: `isGoogleChatTarget()`, `isCreateSchedulerGoogleChatTarget()`, `isUpdateSchedulerGoogleChatTarget()`
  - Add `googlechat` to `SchedulerFilterRule` destination types
- File: `packages/common/src/types/schedulerTaskList.ts`
  - Add `SEND_GOOGLE_CHAT_NOTIFICATION` and `SEND_GOOGLE_CHAT_BATCH_NOTIFICATION`
- File: `packages/common/src/types/errors.ts`
  - Add `GoogleChatError` (HTTP 400, same pattern as `MsTeamsError`)

**Step 1.2 - Add config**
- File: `packages/backend/src/config/parseConfig.ts`
  - Add `googleChat: { enabled: boolean }` to `LightdashConfig`
  - Parse from `GOOGLE_CHAT_ENABLED` env var (default: false)

### Phase 2: Database

**Step 2.1 - Migration**
- Create migration: `pnpm -F backend create-migration add_google_chat_scheduler_target`
- Create `scheduler_google_chat_target` table:
  - `scheduler_google_chat_target_uuid` UUID PK (default random)
  - `scheduler_uuid` UUID FK -> `scheduler(scheduler_uuid)` ON DELETE CASCADE
  - `webhook` TEXT NOT NULL
  - `created_at` TIMESTAMP default NOW
  - `updated_at` TIMESTAMP default NOW

**Step 2.2 - Database entities**
- File: `packages/backend/src/database/entities/scheduler.ts`
  - Add `SchedulerGoogleChatTargetDb` type
  - Add `SchedulerGoogleChatTargetTable` Knex composite type
  - Add table name constant

### Phase 3: Backend Client

**Step 3.1 - GoogleChatClient**
- File: `packages/backend/src/clients/GoogleChat/GoogleChatClient.ts`
- Methods (mirror MicrosoftTeamsClient):
  - `sendWebhook(webhookUrl, payload)` - POST JSON to webhook, accept 200
  - `postImageWithWebhook(webhookUrl, title, description, imageUrl, ctaUrl, pdfUrl?, thresholdAlert?)` - cardsV2 with image widget, text, buttons
  - `postCsvWithWebhook(webhookUrl, title, description, ctaUrl, csvUrl)` - cardsV2 with download button
  - `postCsvsWithWebhook(webhookUrl, title, description, ctaUrl, csvUrls[], warnings?)` - cardsV2 with multiple download buttons, warning text

**Step 3.2 - Register client**
- File: `packages/backend/src/clients/ClientRepository.ts`
  - Add `GoogleChatClient` to repository

### Phase 4: Scheduler Model

**Step 4.1 - SchedulerModel CRUD**
- File: `packages/backend/src/models/SchedulerModel/SchedulerModel.ts`
  - Add google chat target handling in `createScheduler()` - insert targets
  - Add google chat target handling in `updateScheduler()` - upsert targets
  - Add google chat target handling in `deleteSchedulerAndTargets()` - cascade handles it
  - Add google chat targets to `getSchedulerAndTargets()` - join and return
  - Add google chat targets to `getSchedulerAndTargetByTarget()` - lookup by target UUID

### Phase 5: Scheduler Task & Client

**Step 5.1 - SchedulerClient job creation**
- File: `packages/backend/src/scheduler/SchedulerClient.ts`
  - Add `addGoogleChatBatchNotificationJob()` - queue batch notification job
  - Update `generateBatchJobsForSchedulerTargets()` - handle google chat targets
  - Update `generateJobsForSchedulerTargets()` - handle google chat targets for "Send Now"

**Step 5.2 - SchedulerTask handler**
- File: `packages/backend/src/scheduler/SchedulerTask.ts`
  - Add `sendGoogleChatNotification()` - handle single target (legacy compat)
  - Add `sendGoogleChatBatchNotification()` - handle batch targets
  - Follow exact same flow as `sendMsTeamsBatchNotification()`:
    - Parse payload, get page data
    - For each target: call GoogleChatClient method based on format (IMAGE/CSV/XLSX)
    - Use `Promise.allSettled()` for fault tolerance
    - Log per-target results

**Step 5.3 - Register task handler**
- File: `packages/backend/src/scheduler/SchedulerWorker.ts`
  - Register `SEND_GOOGLE_CHAT_NOTIFICATION` and `SEND_GOOGLE_CHAT_BATCH_NOTIFICATION` handlers

### Phase 6: Controller Updates

**Step 6.1 - Scheduler controller**
- File: `packages/backend/src/controllers/schedulerController.ts`
  - Add `googlechat` to destination filter enum/validation
  - Ensure google chat targets are included in scheduler CRUD responses

### Phase 7: Frontend

**Step 7.1 - Google Chat icon**
- File: `packages/frontend/src/svgs/googlechat.svg`
  - Add Google Chat SVG icon

**Step 7.2 - Webhook input component**
- File: `packages/frontend/src/features/scheduler/components/SchedulerForm/SchedulerFormGoogleChatInput.tsx`
  - Mirror `SchedulerFormMicrosoftTeamsInput.tsx`
  - TagInput for multiple webhook URLs
  - Validation: `https://` prefix, no whitespace
  - Link to Google Chat webhook documentation
  - Google Chat icon

**Step 7.3 - Scheduler form integration**
- File: `packages/frontend/src/features/scheduler/components/SchedulerForm/SchedulerForm.tsx`
  - Import and render `SchedulerFormGoogleChatInput` when `googleChat.enabled`
  - Pass google chat targets to form state

**Step 7.4 - Scheduler hooks & filters**
- File: `packages/frontend/src/features/scheduler/hooks/useSchedulerFilters.ts`
  - Add `googlechat` destination filter option
- File: `packages/frontend/src/features/scheduler/hooks/useLogsFilters.ts`
  - Add `googlechat` log filter option

**Step 7.5 - Scheduler form types/state**
- Update scheduler form types to include `googleChatTargets`
- Ensure create/update payloads serialize google chat targets correctly

### Phase 8: Analytics & Logging

**Step 8.1 - Analytics events**
- Ensure `scheduler_notification_job.created/started/completed/failed` events include `googlechat` as target type
- File: `packages/common/src/types/schedulerLog.ts`
  - Add google chat to log target types

### Phase 9: Testing

**Step 9.1 - Unit tests**
- GoogleChatClient: test card formatting for each delivery type (IMAGE, CSV, multi-CSV, threshold alerts)
- Type guards: test `isGoogleChatTarget()` etc.

**Step 9.2 - Integration tests**
- SchedulerModel: test CRUD with google chat targets
- SchedulerTask: test batch notification flow (mock webhook calls)

**Step 9.3 - Manual testing checklist**
- [ ] Create scheduled delivery with Google Chat webhook
- [ ] Verify IMAGE delivery renders correctly in Google Chat
- [ ] Verify CSV delivery shows download link
- [ ] Verify multi-chart dashboard CSV delivery
- [ ] Verify threshold alert formatting
- [ ] Verify partial failure handling (one bad webhook, one good)
- [ ] Verify "Send Now" works
- [ ] Verify scheduler logs show googlechat entries
- [ ] Verify filter by googlechat destination works
- [ ] Test with invalid webhook URL (should show error)
- [ ] Test with Google Chat webhook AND MS Teams webhook on same scheduler

## Estimated Scope

- ~15 files modified, ~4 new files
- Majority is mirroring existing MS Teams code with Google Chat card formatting
- The GoogleChatClient card formatting is the main novel work
- Everything else is plumbing that follows established patterns

## Out of Scope (Future)

- UI redesign for destination section (tabs/accordion)
- Org-level destination enable/disable settings
- Google Chat OAuth/bot integration
- AI agent support in Google Chat
- Link unfurling in Google Chat

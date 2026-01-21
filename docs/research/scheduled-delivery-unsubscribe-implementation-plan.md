# Scheduled Delivery Unsubscribe Feature - Implementation Plan

**Issue**: PROD-2592 - Allow users to unsubscribe from scheduled deliveries
**Created**: 2026-01-21
**Status**: Planning

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Decisions](#2-design-decisions)
3. [Database Changes](#3-database-changes)
4. [Backend Implementation](#4-backend-implementation)
5. [Email Template Changes](#5-email-template-changes)
6. [Unsubscribe Page (Frontend)](#6-unsubscribe-page-frontend)
7. [File-by-File Changes](#7-file-by-file-changes)
8. [Manual Testing Guide](#8-manual-testing-guide)
9. [Edge Cases and Limitations](#9-edge-cases-and-limitations)

---

## 1. Overview

### Goal

Allow email recipients to unsubscribe from scheduled delivery emails by clicking an unsubscribe link in the email footer.

### User Flow

```
1. User receives scheduled delivery email
2. User clicks "Unsubscribe" link in email footer
3. Browser opens unsubscribe page with confirmation
4. User confirms unsubscription
5. User is removed from that scheduler's email targets
6. Future emails for that scheduler are not sent to user
```

### Scope

- **In Scope**: Email unsubscribe only (users clicking link in email)
- **Out of Scope**: Slack/Teams/GSheets (no user-facing unsubscribe mechanism needed)
- **Out of Scope**: Admin UI to manage unsubscribed users (can be added later)

---

## 2. Design Decisions

### Approach: Secure Token-Based Unsubscribe Links

Instead of storing unsubscribed email addresses in a separate table, we will:

1. Generate a cryptographically secure token for each email target
2. Include the token in unsubscribe links
3. When user clicks link, validate token and remove the email target from the scheduler

**Rationale**:
- Simpler implementation (no new table for tracking unsubscribes)
- GDPR-friendly: removing the target = removing the data
- Token prevents enumeration attacks (can't unsubscribe arbitrary emails)

### Token Generation

Use HMAC-SHA256 with a server secret to generate deterministic tokens:

```typescript
token = HMAC-SHA256(secret, `${schedulerEmailTargetUuid}:${recipient}`)
```

This allows:
- No database storage of tokens (computed on demand)
- Deterministic regeneration for the same target
- Secure against forgery without the secret

### Alternative Considered: Unsubscribe Tracking Table

Could add `scheduler_email_unsubscribe` table to track unsubscribed emails. Rejected because:
- More complex (need to check unsubscribe status before each send)
- Data duplication (email stored in target table AND unsubscribe table)
- Deletion is cleaner than soft-unsubscribe

---

## 3. Database Changes

### No New Tables Required

The implementation removes the `scheduler_email_target` row when unsubscribing, so no new tables are needed.

### Alternative: Add Token Column (Optional Enhancement)

If we want pre-generated tokens stored in DB (for performance or audit):

```sql
-- Migration: add_unsubscribe_token_to_scheduler_email_target.ts
ALTER TABLE scheduler_email_target
ADD COLUMN unsubscribe_token VARCHAR(64) UNIQUE;
```

**Recommendation**: Start without stored tokens (computed approach), add later if needed.

---

## 4. Backend Implementation

### 4.1 New Types

**File**: `packages/common/src/types/scheduler.ts`

```typescript
// Add to existing types

export type UnsubscribeTokenPayload = {
    schedulerEmailTargetUuid: string;
    recipient: string;
};

export type UnsubscribeRequest = {
    token: string;
};

export type UnsubscribeResponse = {
    success: boolean;
    schedulerName: string;
    message: string;
};

export type UnsubscribeLinkData = {
    unsubscribeUrl: string;
};
```

### 4.2 Token Utility Functions

**File**: `packages/backend/src/utils/unsubscribeToken.ts` (NEW FILE)

```typescript
import crypto from 'crypto';
import { lightdashConfig } from '../config/lightdashConfig';
import { UnauthorizedError } from '@lightdash/common';

const UNSUBSCRIBE_SECRET = lightdashConfig.security.unsubscribeSecret
    || lightdashConfig.security.secret; // Fallback to main secret

export const generateUnsubscribeToken = (
    schedulerEmailTargetUuid: string,
    recipient: string
): string => {
    const payload = `${schedulerEmailTargetUuid}:${recipient}`;
    return crypto
        .createHmac('sha256', UNSUBSCRIBE_SECRET)
        .update(payload)
        .digest('hex');
};

export const validateUnsubscribeToken = (
    token: string,
    schedulerEmailTargetUuid: string,
    recipient: string
): boolean => {
    const expectedToken = generateUnsubscribeToken(
        schedulerEmailTargetUuid,
        recipient
    );
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(expectedToken)
    );
};

export const buildUnsubscribeUrl = (
    schedulerEmailTargetUuid: string,
    recipient: string
): string => {
    const token = generateUnsubscribeToken(schedulerEmailTargetUuid, recipient);
    const baseUrl = lightdashConfig.siteUrl;
    return `${baseUrl}/unsubscribe?target=${schedulerEmailTargetUuid}&token=${token}`;
};
```

### 4.3 Model Changes

**File**: `packages/backend/src/models/SchedulerModel/index.ts`

Add new methods:

```typescript
// Get email target by UUID (for unsubscribe validation)
async getEmailTargetByUuid(
    schedulerEmailTargetUuid: string
): Promise<{
    schedulerEmailTargetUuid: string;
    schedulerUuid: string;
    recipient: string;
    schedulerName: string;
} | null> {
    const result = await this.database(SchedulerEmailTargetTableName)
        .join(
            SchedulerTableName,
            `${SchedulerEmailTargetTableName}.scheduler_uuid`,
            `${SchedulerTableName}.scheduler_uuid`
        )
        .where(
            `${SchedulerEmailTargetTableName}.scheduler_email_target_uuid`,
            schedulerEmailTargetUuid
        )
        .select(
            `${SchedulerEmailTargetTableName}.scheduler_email_target_uuid`,
            `${SchedulerEmailTargetTableName}.scheduler_uuid`,
            `${SchedulerEmailTargetTableName}.recipient`,
            `${SchedulerTableName}.name as scheduler_name`
        )
        .first();

    if (!result) return null;

    return {
        schedulerEmailTargetUuid: result.scheduler_email_target_uuid,
        schedulerUuid: result.scheduler_uuid,
        recipient: result.recipient,
        schedulerName: result.scheduler_name,
    };
}

// Delete email target (for unsubscribe)
async deleteEmailTarget(schedulerEmailTargetUuid: string): Promise<void> {
    await this.database(SchedulerEmailTargetTableName)
        .where('scheduler_email_target_uuid', schedulerEmailTargetUuid)
        .delete();
}
```

### 4.4 Service Changes

**File**: `packages/backend/src/services/SchedulerService/SchedulerService.ts`

Add new method:

```typescript
async unsubscribeFromScheduler(
    token: string,
    schedulerEmailTargetUuid: string
): Promise<{ schedulerName: string }> {
    // Get the email target
    const target = await this.schedulerModel.getEmailTargetByUuid(
        schedulerEmailTargetUuid
    );

    if (!target) {
        throw new NotFoundError('Subscription not found or already unsubscribed');
    }

    // Validate token
    const isValidToken = validateUnsubscribeToken(
        token,
        target.schedulerEmailTargetUuid,
        target.recipient
    );

    if (!isValidToken) {
        throw new UnauthorizedError('Invalid unsubscribe token');
    }

    // Delete the email target
    await this.schedulerModel.deleteEmailTarget(schedulerEmailTargetUuid);

    // Log the unsubscribe action (optional - for audit)
    this.analytics.track({
        event: 'scheduler.email_unsubscribed',
        userId: 'anonymous', // No user session
        properties: {
            schedulerUuid: target.schedulerUuid,
            schedulerName: target.schedulerName,
        },
    });

    return { schedulerName: target.schedulerName };
}
```

### 4.5 Controller Changes

**File**: `packages/backend/src/controllers/schedulerController.ts`

Add new public endpoint (no auth required):

```typescript
/**
 * Unsubscribe from scheduled delivery emails
 * @param requestBody Unsubscribe request with token
 * @param schedulerEmailTargetUuid Target UUID from unsubscribe link
 */
@Post('unsubscribe/{schedulerEmailTargetUuid}')
@OperationId('unsubscribeFromScheduledDelivery')
@NoSecurity() // Public endpoint - no authentication required
@SuccessResponse('200', 'Successfully unsubscribed')
async unsubscribe(
    @Path() schedulerEmailTargetUuid: string,
    @Body() body: { token: string }
): Promise<ApiSuccessResponse<{ schedulerName: string; message: string }>> {
    const result = await this.schedulerService.unsubscribeFromScheduler(
        body.token,
        schedulerEmailTargetUuid
    );

    return {
        status: 'ok',
        results: {
            schedulerName: result.schedulerName,
            message: `You have been unsubscribed from "${result.schedulerName}"`,
        },
    };
}
```

### 4.6 Email Sending Changes

**File**: `packages/backend/src/scheduler/SchedulerTask.ts`

Modify `sendEmailNotification` to pass unsubscribe URL:

```typescript
// In sendEmailNotification method, add unsubscribe URL generation
const unsubscribeUrl = buildUnsubscribeUrl(
    notification.schedulerEmailTargetUuid,
    notification.recipient
);

// Pass to email client methods
await this.emailClient.sendImageNotificationEmail({
    ...existingParams,
    unsubscribeUrl,
});
```

**File**: `packages/backend/src/clients/EmailClient/EmailClient.ts`

Update all scheduled delivery email methods to accept and include unsubscribe URL:

```typescript
// Update method signatures
async sendImageNotificationEmail(options: {
    // ...existing options
    unsubscribeUrl: string;
}): Promise<void> {
    // Pass unsubscribeUrl to template context
}

async sendChartCsvNotificationEmail(options: {
    // ...existing options
    unsubscribeUrl: string;
}): Promise<void> {
    // Pass unsubscribeUrl to template context
}

async sendDashboardCsvNotificationEmail(options: {
    // ...existing options
    unsubscribeUrl: string;
}): Promise<void> {
    // Pass unsubscribeUrl to template context
}
```

---

## 5. Email Template Changes

### 5.1 Template Updates

Add unsubscribe footer to all scheduled delivery email templates:

**Files to modify**:
- `packages/backend/src/clients/EmailClient/templates/imageNotification.html`
- `packages/backend/src/clients/EmailClient/templates/chartCsvNotification.html`
- `packages/backend/src/clients/EmailClient/templates/dashboardCsvNotification.html`

**Add footer section**:

```html
<!-- Add before closing </body> tag -->
<table width="100%" style="margin-top: 32px; border-top: 1px solid #e0e0e0; padding-top: 16px;">
    <tr>
        <td align="center" style="color: #666666; font-size: 12px; font-family: Arial, sans-serif;">
            <p style="margin: 0;">
                You're receiving this email because you're subscribed to scheduled deliveries from Lightdash.
            </p>
            <p style="margin: 8px 0 0 0;">
                <a href="{{unsubscribeUrl}}" style="color: #7262ff; text-decoration: underline;">
                    Unsubscribe from this scheduled delivery
                </a>
            </p>
        </td>
    </tr>
</table>
```

### 5.2 List-Unsubscribe Header

Add RFC 8058 compliant List-Unsubscribe header for email client integration:

**File**: `packages/backend/src/clients/EmailClient/EmailClient.ts`

```typescript
// Add to email options for all scheduled delivery emails
const mailOptions = {
    // ...existing options
    headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
};
```

---

## 6. Unsubscribe Page (Frontend)

### 6.1 New Route

**File**: `packages/frontend/src/App.tsx`

Add public route:

```tsx
<Route path="/unsubscribe" element={<UnsubscribePage />} />
```

### 6.2 Unsubscribe Page Component

**File**: `packages/frontend/src/pages/UnsubscribePage.tsx` (NEW FILE)

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Center, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useUnsubscribe } from '../hooks/scheduler/useUnsubscribe';

export const UnsubscribePage = () => {
    const [searchParams] = useSearchParams();
    const targetUuid = searchParams.get('target');
    const token = searchParams.get('token');

    const [confirmed, setConfirmed] = useState(false);
    const { mutate: unsubscribe, isLoading, isSuccess, isError, data, error } = useUnsubscribe();

    const handleUnsubscribe = () => {
        if (targetUuid && token) {
            unsubscribe({ targetUuid, token });
            setConfirmed(true);
        }
    };

    // Invalid URL parameters
    if (!targetUuid || !token) {
        return (
            <Center style={{ minHeight: '100vh' }}>
                <Card shadow="md" padding="xl" radius="md" style={{ maxWidth: 400 }}>
                    <Stack align="center" gap="md">
                        <IconX size={48} color="red" />
                        <Title order={2}>Invalid Link</Title>
                        <Text c="dimmed" ta="center">
                            This unsubscribe link is invalid or has expired.
                        </Text>
                    </Stack>
                </Card>
            </Center>
        );
    }

    // Success state
    if (isSuccess && data) {
        return (
            <Center style={{ minHeight: '100vh' }}>
                <Card shadow="md" padding="xl" radius="md" style={{ maxWidth: 400 }}>
                    <Stack align="center" gap="md">
                        <IconCheck size={48} color="green" />
                        <Title order={2}>Unsubscribed</Title>
                        <Text c="dimmed" ta="center">
                            You have been unsubscribed from "{data.schedulerName}".
                            You will no longer receive these scheduled delivery emails.
                        </Text>
                    </Stack>
                </Card>
            </Center>
        );
    }

    // Error state
    if (isError) {
        return (
            <Center style={{ minHeight: '100vh' }}>
                <Card shadow="md" padding="xl" radius="md" style={{ maxWidth: 400 }}>
                    <Stack align="center" gap="md">
                        <IconX size={48} color="red" />
                        <Title order={2}>Unsubscribe Failed</Title>
                        <Text c="dimmed" ta="center">
                            {error?.message || 'Unable to unsubscribe. This link may have already been used or expired.'}
                        </Text>
                    </Stack>
                </Card>
            </Center>
        );
    }

    // Confirmation state (before clicking)
    return (
        <Center style={{ minHeight: '100vh' }}>
            <Card shadow="md" padding="xl" radius="md" style={{ maxWidth: 400 }}>
                <Stack align="center" gap="md">
                    <Title order={2}>Unsubscribe</Title>
                    <Text c="dimmed" ta="center">
                        Are you sure you want to unsubscribe from this scheduled delivery?
                        You will no longer receive these emails.
                    </Text>
                    <Button
                        onClick={handleUnsubscribe}
                        loading={isLoading}
                        color="red"
                        variant="filled"
                    >
                        Yes, Unsubscribe
                    </Button>
                </Stack>
            </Card>
        </Center>
    );
};
```

### 6.3 API Hook

**File**: `packages/frontend/src/hooks/scheduler/useUnsubscribe.ts` (NEW FILE)

```tsx
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

type UnsubscribeParams = {
    targetUuid: string;
    token: string;
};

type UnsubscribeResponse = {
    schedulerName: string;
    message: string;
};

const unsubscribeFromScheduler = async (
    params: UnsubscribeParams
): Promise<UnsubscribeResponse> => {
    return lightdashApi<UnsubscribeResponse>({
        url: `/schedulers/unsubscribe/${params.targetUuid}`,
        method: 'POST',
        body: JSON.stringify({ token: params.token }),
    });
};

export const useUnsubscribe = () => {
    return useMutation({
        mutationFn: unsubscribeFromScheduler,
    });
};
```

---

## 7. File-by-File Changes

### Summary Table

| File | Action | Description |
|------|--------|-------------|
| `packages/common/src/types/scheduler.ts` | MODIFY | Add unsubscribe-related types |
| `packages/backend/src/utils/unsubscribeToken.ts` | CREATE | Token generation/validation utilities |
| `packages/backend/src/models/SchedulerModel/index.ts` | MODIFY | Add `getEmailTargetByUuid` and `deleteEmailTarget` methods |
| `packages/backend/src/services/SchedulerService/SchedulerService.ts` | MODIFY | Add `unsubscribeFromScheduler` method |
| `packages/backend/src/controllers/schedulerController.ts` | MODIFY | Add `POST /unsubscribe/{uuid}` endpoint |
| `packages/backend/src/scheduler/SchedulerTask.ts` | MODIFY | Pass unsubscribe URL to email methods |
| `packages/backend/src/clients/EmailClient/EmailClient.ts` | MODIFY | Accept and use unsubscribe URL in email methods |
| `packages/backend/src/clients/EmailClient/templates/imageNotification.html` | MODIFY | Add unsubscribe footer |
| `packages/backend/src/clients/EmailClient/templates/chartCsvNotification.html` | MODIFY | Add unsubscribe footer |
| `packages/backend/src/clients/EmailClient/templates/dashboardCsvNotification.html` | MODIFY | Add unsubscribe footer |
| `packages/frontend/src/App.tsx` | MODIFY | Add `/unsubscribe` route |
| `packages/frontend/src/pages/UnsubscribePage.tsx` | CREATE | Unsubscribe confirmation page |
| `packages/frontend/src/hooks/scheduler/useUnsubscribe.ts` | CREATE | API mutation hook |

### Detailed Changes

#### 1. `packages/common/src/types/scheduler.ts`

**Lines to add** (at end of file):

```typescript
// Unsubscribe types
export type UnsubscribeRequest = {
    token: string;
};

export type UnsubscribeResponse = {
    success: boolean;
    schedulerName: string;
    message: string;
};
```

#### 2. `packages/backend/src/utils/unsubscribeToken.ts`

**New file** - See section 4.2 for full implementation.

#### 3. `packages/backend/src/models/SchedulerModel/index.ts`

**Add methods** - See section 4.3 for implementation.

Location: Add after existing `deleteScheduler` method (~line 600).

#### 4. `packages/backend/src/services/SchedulerService/SchedulerService.ts`

**Add method** - See section 4.4 for implementation.

Location: Add after existing `deleteScheduler` method (~line 400).

Add import at top:
```typescript
import { validateUnsubscribeToken } from '../utils/unsubscribeToken';
```

#### 5. `packages/backend/src/controllers/schedulerController.ts`

**Add endpoint** - See section 4.5 for implementation.

Location: Add at end of class, before closing brace.

Add import:
```typescript
import { NoSecurity } from 'tsoa'; // May need to check TSOA docs for exact decorator
```

#### 6. `packages/backend/src/scheduler/SchedulerTask.ts`

**Modify `sendEmailNotification` method**.

Location: Find `sendEmailNotification` method (~line 2800).

Add import at top:
```typescript
import { buildUnsubscribeUrl } from '../utils/unsubscribeToken';
```

Add before email client calls:
```typescript
const unsubscribeUrl = buildUnsubscribeUrl(
    notification.schedulerEmailTargetUuid,
    notification.recipient
);
```

Pass `unsubscribeUrl` to each email client method call.

#### 7. `packages/backend/src/clients/EmailClient/EmailClient.ts`

**Modify email method signatures and template context**.

Location: Each scheduled delivery email method.

Add `unsubscribeUrl: string` to method parameters.

Add to template context and mail headers:
```typescript
context: {
    ...existingContext,
    unsubscribeUrl,
},
headers: {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
},
```

#### 8-10. Email Templates

Add unsubscribe footer (see section 5.1) to:
- `imageNotification.html`
- `chartCsvNotification.html`
- `dashboardCsvNotification.html`

#### 11. `packages/frontend/src/App.tsx`

Add route inside router:
```tsx
<Route path="/unsubscribe" element={<UnsubscribePage />} />
```

Add import:
```tsx
import { UnsubscribePage } from './pages/UnsubscribePage';
```

#### 12-13. Frontend New Files

Create files as specified in sections 6.2 and 6.3.

---

## 8. Manual Testing Guide

### Prerequisites

1. Local development environment running
2. SMTP configured (use Mailhog for local testing: `docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog`)
3. At least one scheduler with email target created

### Test Cases

#### TC1: Basic Unsubscribe Flow

1. Create a scheduler with your email as a target
2. Trigger the scheduler (use "Send now" feature)
3. Check email in Mailhog (http://localhost:8025)
4. Verify unsubscribe link appears in email footer
5. Click unsubscribe link
6. Verify confirmation page appears
7. Click "Yes, Unsubscribe"
8. Verify success message with scheduler name
9. Verify email target is removed from scheduler (check via API or DB)
10. Trigger scheduler again - verify no email is sent to unsubscribed address

**Expected**: User successfully unsubscribes and no longer receives emails.

#### TC2: Invalid Token

1. Get a valid unsubscribe URL
2. Modify the token parameter to an invalid value
3. Visit the modified URL
4. Click "Yes, Unsubscribe"

**Expected**: Error message "Invalid unsubscribe token" or similar.

#### TC3: Already Unsubscribed (Double-click)

1. Complete TC1 to unsubscribe
2. Use the same unsubscribe link again
3. Click "Yes, Unsubscribe"

**Expected**: Error message "Subscription not found or already unsubscribed".

#### TC4: Missing URL Parameters

1. Visit `/unsubscribe` with no query parameters
2. Visit `/unsubscribe?target=abc` (missing token)
3. Visit `/unsubscribe?token=abc` (missing target)

**Expected**: "Invalid Link" error page for all cases.

#### TC5: Email Client List-Unsubscribe Header

1. Send a scheduled delivery email
2. View raw email headers in Mailhog
3. Verify `List-Unsubscribe` and `List-Unsubscribe-Post` headers are present

**Expected**: Headers present with valid unsubscribe URL.

#### TC6: Multiple Recipients - Independent Unsubscribe

1. Create scheduler with 3 email targets
2. Unsubscribe one recipient
3. Trigger scheduler

**Expected**: Only 2 emails sent (unsubscribed recipient excluded).

#### TC7: All Email Types

Repeat TC1 for each email format:
- IMAGE format (screenshot)
- CSV format
- XLSX format

**Expected**: Unsubscribe link appears in all email types.

### Database Verification Queries

```sql
-- Check email targets for a scheduler
SELECT * FROM scheduler_email_target
WHERE scheduler_uuid = 'YOUR_SCHEDULER_UUID';

-- Verify target was deleted after unsubscribe
SELECT COUNT(*) FROM scheduler_email_target
WHERE scheduler_email_target_uuid = 'TARGET_UUID';
-- Should return 0 after unsubscribe
```

### API Verification

```bash
# Get scheduler and verify email targets
curl -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/schedulers/SCHEDULER_UUID"

# Test unsubscribe endpoint directly
curl -X POST "$SITE_URL/api/v1/schedulers/unsubscribe/TARGET_UUID" \
  -H "Content-Type: application/json" \
  -d '{"token": "VALID_TOKEN"}'
```

---

## 9. Edge Cases and Limitations

### Edge Cases

| Case | Behavior | Notes |
|------|----------|-------|
| User clicks unsubscribe link twice | Second click shows "already unsubscribed" error | Token validates but target doesn't exist |
| Scheduler owner removes email before user unsubscribes | Same as above - graceful error | Target not found |
| Email target re-added after unsubscribe | User will receive emails again | New target = new token |
| Scheduler deleted | Unsubscribe link will fail | Target cascade-deleted with scheduler |
| User forwards email with unsubscribe link | Anyone with link can unsubscribe | By design - token is bearer credential |
| Token in URL could be logged | Potential security concern | Mitigated: single-use effective (target deleted) |
| Server secret rotated | Old tokens become invalid | Users need new email to unsubscribe |

### Limitations

1. **No "Resubscribe" Feature**
   - Once unsubscribed, user must be re-added by scheduler owner
   - Could add resubscribe page later if needed

2. **No Global Unsubscribe**
   - User must unsubscribe from each scheduler individually
   - Could add "unsubscribe from all" later

3. **No Admin View of Unsubscribes**
   - No audit trail of who unsubscribed (target is deleted)
   - Could add analytics event logging for audit

4. **Email Forwarding Risk**
   - If user forwards email, recipient can unsubscribe original user
   - Acceptable risk - same as most unsubscribe systems

5. **No Authentication Required**
   - Public endpoint by design (users may not have Lightdash accounts)
   - Token provides authorization

6. **Single Scheduler Scope**
   - Link only unsubscribes from one scheduler
   - Multiple schedulers require multiple unsubscribes

### Security Considerations

1. **Token Security**
   - HMAC-SHA256 prevents forgery
   - Constant-time comparison prevents timing attacks
   - No enumeration possible (need valid target UUID + token)

2. **Rate Limiting**
   - Consider adding rate limiting to unsubscribe endpoint
   - Prevents brute-force token guessing (though 256-bit space makes this impractical)

3. **Audit Logging**
   - Analytics event tracks unsubscribes
   - Consider adding to scheduler_log table for full audit

### Future Enhancements

1. Add "Unsubscribe from all scheduled deliveries" option
2. Add admin UI to view unsubscribe history
3. Add "Manage email preferences" page for authenticated users
4. Add resubscribe capability
5. Add organization-level email suppression list

---

## Appendix: API Generation

After making controller changes, regenerate the OpenAPI spec:

```bash
pnpm generate-api
```

This updates:
- `packages/backend/src/generated/api.ts`
- Frontend API types

---

## Implementation Order

Recommended order for implementation:

1. **Phase 1: Backend Foundation**
   - Create `unsubscribeToken.ts` utility
   - Add model methods
   - Add service method
   - Add controller endpoint
   - Run `pnpm generate-api`

2. **Phase 2: Email Integration**
   - Modify `SchedulerTask.ts` to generate URLs
   - Modify `EmailClient.ts` to accept URLs
   - Update email templates

3. **Phase 3: Frontend**
   - Add route to App.tsx
   - Create UnsubscribePage component
   - Create useUnsubscribe hook

4. **Phase 4: Testing & Polish**
   - Manual testing all scenarios
   - Add analytics tracking
   - Documentation updates

---

*Document last updated: 2026-01-21*

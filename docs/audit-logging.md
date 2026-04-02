# Audit Logging Architecture

This document describes how audit logging works in Lightdash, covering the system design, actor types, event schema, and
how to add audit logging to new services.

---

## Overview

Lightdash uses a CASL-based authorization system where every permission check (`can`/`cannot`) can be automatically
audit-logged. The audit logging layer wraps CASL's Ability class to intercept permission checks and emit structured
events at Winston's `audit` log level.

This enables ITGC compliance by tracking:

- **Machine actions**: SCIM, service accounts
- **Administrative actions**: Role/permission changes, configuration changes
- **User edits**: Dashboard and chart modifications, folder structure changes

---

## Key Components

| Component                            | Location                                                   | Purpose                                                            |
|--------------------------------------|------------------------------------------------------------|--------------------------------------------------------------------|
| `AuditLogEvent` schema               | `packages/backend/src/logging/auditLog.ts`                 | Zod-validated event structure                                      |
| `CaslAuditWrapper`                   | `packages/backend/src/logging/caslAuditWrapper.ts`         | Wraps CASL Ability to intercept `can`/`cannot` calls               |
| `BaseService.createAuditedAbility()` | `packages/backend/src/services/BaseService.ts`             | Helper that creates a CaslAuditWrapper with logging pre-configured |
| `logAuditEvent()`                    | `packages/backend/src/logging/winston.ts`                  | Emits audit events to Winston at the `audit` level                 |
| ESLint rule                          | `packages/backend/eslint-rules/no-direct-ability-check.js` | Prevents direct `.ability.can/cannot` calls in services            |

---

## Actor Types (Discriminated Union)

Audit actors are modeled as a discriminated union on the `type` field:

| Actor Type          | `type` values             | Description                            | Key Fields                                                                      |
|---------------------|---------------------------|----------------------------------------|---------------------------------------------------------------------------------|
| **User**            | `session`, `pat`, `oauth` | Human users via browser, PAT, or OAuth | `uuid`, `email`, `firstName`, `lastName`, `organizationRole`, `impersonatedBy?` |
| **Service Account** | `service-account`         | Machine-to-machine CI/CD accounts      | `uuid`, `email`, `organizationRole`                                             |
| **Anonymous**       | `anonymous`               | Embedded dashboard viewers (JWT auth)  | `uuid`, `organizationUuid`                                                      |

The `impersonatedBy` field on user actors tracks admin impersonation for compliance. When an admin acts as another user,
both the target user and the impersonating admin are recorded.

---

## Event Schema

Every audit event contains:

```typescript
{
    id: string;              // UUID, auto-generated
    timestamp: string;       // ISO 8601 UTC
    actor: AuditActor;       // Who performed the action (see Actor Types)
    action: string;          // CASL action: 'view', 'create', 'update', 'delete', 'manage'
    resource: {
        type: string;          // CASL subject: 'Dashboard', 'SavedChart', 'Space', etc.
        uuid ? : string;         // Resource identifier
        name ? : string;         // Human-readable name
        organizationUuid: string;
        projectUuid ? : string;
    }
    ;
    context: {
        ip ? : string;           // Client IP address
        userAgent ? : string;    // Client user agent
        requestId ? : string;    // Correlation ID for request tracing
    }
    ;
    status: 'allowed' | 'denied';  // Permission check result
    reason ? : string;                // CASL rule `.because()` explanation
    ruleConditions ? : string;        // Serialized CASL rule conditions (JSON)
    callStack ? : Array<{      // Which service methods triggered this check
        serviceName: string;
        methodName: string;
        depth: number;
    }>;
}
```

---

## Winston Log Levels

Audit events use a custom Winston log level:

```
error: 0    (highest priority)
warn:  1
info:  2
http:  3
audit: 4    <-- audit events
debug: 5    (lowest priority)
```

Configure audit logging via environment variables:

```bash
# File output for SIEM ingestion
LIGHTDASH_LOG_FILE_PATH="/var/log/lightdash/audit.log"
LIGHTDASH_LOG_FILE_LEVEL="audit"
LIGHTDASH_LOG_FILE_FORMAT="json"

# Console can be set independently
LIGHTDASH_LOG_LEVEL="info"
LIGHTDASH_LOG_FORMAT="json"
LIGHTDASH_LOG_OUTPUTS="console,file"
```

---

## How to Add Audit Logging to a Service

### Step 1: Use `createAuditedAbility()` Instead of Direct Ability Checks

Every service that extends `BaseService` has access to `this.createAuditedAbility()`. This is a drop-in replacement for
accessing `user.ability` directly.

**Before (no audit logging):**

```typescript
import { subject } from '@casl/ability';
import { ForbiddenError } from '@lightdash/common';

class MyService extends BaseService {
    async getResource(user: SessionUser, resourceUuid: string) {
        const resource = await this.model.get(resourceUuid);

        // Direct ability check - NOT audit logged
        if (user.ability.cannot('view', subject('MyResource', resource))) {
            throw new ForbiddenError();
        }

        return resource;
    }
}
```

**After (audit logged):**

```typescript
import { subject } from '@casl/ability';
import { ForbiddenError } from '@lightdash/common';

class MyService extends BaseService {
    async getResource(user: SessionUser, resourceUuid: string) {
        const resource = await this.model.get(resourceUuid);

        // Audited ability - every can/cannot call is logged
        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('view', subject('MyResource', resource))) {
            throw new ForbiddenError();
        }

        return resource;
    }
}
```

### Step 2: Reuse the Audited Ability Within a Method

If a method makes multiple permission checks, create the audited ability once and reuse it:

```typescript
class MyService extends BaseService {
    async updateResource(user: SessionUser, uuid: string, data: UpdateData) {
        const resource = await this.model.get(uuid);
        const auditedAbility = this.createAuditedAbility(user);

        // Check 1: Can user update in current space?
        if (auditedAbility.cannot('update', subject('MyResource', resource))) {
            throw new ForbiddenError();
        }

        // Check 2: If moving to new space, can user update there?
        if (data.spaceUuid && data.spaceUuid !== resource.spaceUuid) {
            const newSpace = await this.spaceModel.get(data.spaceUuid);
            if (auditedAbility.cannot('update', subject('MyResource', newSpace))) {
                throw new ForbiddenError("No access to the target space");
            }
        }

        return this.model.update(uuid, data);
    }
}
```

### Step 3: Works with Account Type Too

For services that receive the `Account` type (newer pattern), the same method works:

```typescript
class MyService extends BaseService {
    async listRoles(account: Account) {
        const auditedAbility = this.createAuditedAbility(account);
        if (auditedAbility.cannot('view', subject('Organization', { ... }))) {
            throw new ForbiddenError();
        }
        // ...
    }
}
```

### Step 4: Always Use `subject()` for Typed Subjects

Always wrap permission checks with CASL's `subject()` helper. This ensures the audit log captures the correct resource
type name. Without `subject()`, the `__caslSubjectType__` field is missing and the resource type in the audit log will
be `"unknown"`.

```typescript
// Good - audit log will show resource.type = "Dashboard"
auditedAbility.cannot('view', subject('Dashboard', { organizationUuid, projectUuid, uuid: dashboardUuid }))

// Bad - audit log will show resource.type = "unknown"
auditedAbility.cannot('view', { organizationUuid, projectUuid })
```

### Step 5: Generate UUIDs Before Permission Checks on Create Actions

For create operations, generate the resource UUID *before* the permission check so the audit log includes the UUID of
the resource that will be created. This makes it possible to correlate the permission check with the resulting resource.

```typescript
async createDashboard(user: SessionUser, projectUuid: string, data: CreateDashboard) {
    const dashboardUuid = uuidv4(); // Generate UUID first
    const auditedAbility = this.createAuditedAbility(user);

    // Audit log will include uuid: "abc-123" even for the create check
    if (auditedAbility.cannot('create', subject('Dashboard', {
        organizationUuid,
        projectUuid,
        uuid: dashboardUuid,
    }))) {
        throw new ForbiddenError();
    }

    // Pass the pre-generated UUID to the model
    return this.dashboardModel.create({ ...data, uuid: dashboardUuid });
}
```

---

## Example: Full Audit Log Output

When a developer with PAT authentication views a dashboard:

```json
{
  "level": "audit",
  "message": "view Dashboard abc-123-uuid by user-456 (allowed)",
  "id": "evt-789",
  "timestamp": "2026-04-01T10:30:00.000Z",
  "actor": {
    "type": "pat",
    "uuid": "user-456",
    "email": "developer@company.com",
    "firstName": "Jane",
    "lastName": "Dev",
    "organizationUuid": "org-001",
    "organizationRole": "developer",
    "groupMemberships": []
  },
  "action": "view",
  "resource": {
    "type": "Dashboard",
    "uuid": "abc-123-uuid",
    "organizationUuid": "org-001",
    "projectUuid": "proj-001"
  },
  "context": {},
  "status": "allowed",
  "ruleConditions": "{\"organizationUuid\":\"org-001\"}",
  "callStack": [
    {
      "serviceName": "DashboardService",
      "methodName": "getByIdOrSlug",
      "depth": 0
    }
  ]
}
```

When a denied access attempt occurs (e.g., viewer trying to delete):

```json
{
  "level": "audit",
  "message": "delete Dashboard abc-123-uuid by user-789 (denied)",
  "id": "evt-012",
  "timestamp": "2026-04-01T10:31:00.000Z",
  "actor": {
    "type": "session",
    "uuid": "user-789",
    "email": "viewer@company.com",
    "firstName": "Bob",
    "lastName": "Viewer",
    "organizationUuid": "org-001",
    "organizationRole": "viewer",
    "groupMemberships": []
  },
  "action": "delete",
  "resource": {
    "type": "Dashboard",
    "uuid": "abc-123-uuid",
    "organizationUuid": "org-001",
    "projectUuid": "proj-001"
  },
  "context": {},
  "status": "denied",
  "reason": "Viewers cannot delete dashboards",
  "callStack": [
    {
      "serviceName": "DashboardService",
      "methodName": "delete",
      "depth": 0
    }
  ]
}
```

---

## ESLint Enforcement

The custom ESLint rule `no-direct-ability-check` (loaded via `--rulesdir eslint-rules`) detects direct `.ability.can()` /
`.ability.cannot()` usage in service files and flags them as **errors**. The build will fail if any new code uses direct
ability checks without going through `createAuditedAbility()`.

The rule catches patterns like:

- `user.ability.can('view', ...)`
- `account.user.ability.cannot('manage', ...)`
- `actor.ability.can('update', ...)`

And suggests using `this.createAuditedAbility()` instead.

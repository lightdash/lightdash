# Permissions System

This document covers how permissions work in Lightdash, including custom roles, scopes, CASL abilities, and enforcement throughout the application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERMISSION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DEFINITION                     2. STORAGE                                │
│  ┌─────────────────────┐           ┌─────────────────────┐                  │
│  │ scopes.ts           │           │ Database            │                  │
│  │ - 70+ scopes        │           │ - roles table       │                  │
│  │ - getConditions()   │           │ - scoped_roles      │                  │
│  │ - groups/modifiers  │           │ - memberships       │                  │
│  └─────────────────────┘           └─────────────────────┘                  │
│           │                                 │                                │
│           ▼                                 ▼                                │
│  3. ABILITY BUILDING (Runtime)                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ getUserAbilityBuilder()                                               │   │
│  │ ├─ System Role? → projectMemberAbility[role](member, builder)        │   │
│  │ └─ Custom Role? → buildAbilityFromScopes(scopes, context, builder)   │   │
│  │                     └─ For each scope:                                │   │
│  │                        ├─ Parse: "manage:Dashboard@space"             │   │
│  │                        ├─ Get conditions: scope.getConditions(ctx)    │   │
│  │                        └─ builder.can('manage', 'Dashboard', conds)   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                                                                  │
│           ▼                                                                  │
│  4. ENFORCEMENT                                                              │
│  ┌─────────────────────┐           ┌─────────────────────┐                  │
│  │ Backend             │           │ Frontend            │                  │
│  │ user.ability.cannot │           │ user.ability.can    │                  │
│  │ → ForbiddenError    │           │ → Conditional UI    │                  │
│  └─────────────────────┘           └─────────────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Technologies:**
- **CASL** - Isomorphic authorization library for JavaScript
- **Custom Roles** - Enterprise feature for fine-grained permission control

---

## Core Concepts

### Scopes

Scopes are the fundamental permission units in Lightdash. Each scope defines what action can be performed on what resource.

**Format:** `action:Subject` or `action:Subject@modifier`

**Examples:**
- `view:Dashboard` - View dashboards
- `manage:Dashboard@space` - Edit dashboards in spaces where user has editor/admin access
- `manage:ScheduledDeliveries@self` - Manage user's own scheduled deliveries

**Scope Groups** (defined in `packages/common/src/types/scopes.ts`):

| Group | Purpose |
|-------|---------|
| `CONTENT` | Dashboards, charts, spaces, comments, tags |
| `PROJECT_MANAGEMENT` | Project settings, scheduled deliveries, jobs |
| `ORGANIZATION_MANAGEMENT` | Org settings, members, groups, invite links |
| `DATA` | SQL runner, explore, underlying data, exports |
| `SHARING` | Export to CSV/image/PDF |
| `AI` | AI agent features (enterprise) |
| `SPOTLIGHT` | Metrics tree, spotlight config (enterprise) |

**Modifiers:**

| Modifier | Meaning | Example |
|----------|---------|---------|
| `@self` | User's own resources | `manage:ScheduledDeliveries@self` |
| `@public` | Public/non-private resources | `manage:Space@public` |
| `@assigned` | Resources user is assigned to (admin) | `manage:Space@assigned` |
| `@space` | Resources in spaces where user has editor+ role | `manage:Dashboard@space` |
| `@preview` | Preview projects only | `create:Project@preview` |

### CASL Abilities

CASL is the underlying authorization library. Lightdash builds CASL abilities from scopes (defined in `packages/common/src/authorization/types.ts`).

**AbilityAction types**:
- `create` - Create new resources
- `delete` - Delete resources
- `export` - Export data
- `manage` - Full CRUD + special operations
- `promote` - Promote content to spaces
- `update` - Update existing resources
- `view` - Read-only access

**CaslSubjectNames** (~35 subject types):
```
AiAgent, AiAgentThread, Analytics, ChangeCsvResults, CompileProject,
ContentAsCode, CustomSql, Dashboard, DashboardComments, DashboardCsv,
DashboardImage, DashboardPdf, Explore, ExportCsv, GoogleSheets, Group,
InviteLink, Job, JobStatus, MetricsTree, Organization,
OrganizationMemberProfile, OrganizationWarehouseCredentials,
PersonalAccessToken, PinnedItems, Project, SavedChart, ScheduledDeliveries,
SemanticViewer, SourceCode, Space, SpotlightTableConfig, SqlRunner, Tags,
UnderlyingData, Validation, VirtualView
```

### System Roles vs Custom Roles

**System Roles** - Built-in roles with predefined permissions. These roles are canonical and work out of the box. 

| Role | Inherits From | Key Additions |
|------|---------------|---------------|
| `viewer` | - | View public content, export CSV |
| `interactive_viewer` | viewer | Explore data, schedule deliveries, space-level edits |
| `editor` | interactive_viewer | Create spaces, manage public spaces, tags |
| `developer` | editor | SQL runner, validation, compile, preview projects |
| `admin` | developer | Full project management, all content access |

**Custom Roles** (Enterprise) - Admin-defined roles with explicit scope assignment:
- No inheritance - scopes are explicitly assigned
- Stored in database (`roles` + `scoped_roles` tables)
- Can mix and match any scopes

---

## How Scopes Translate to CASL Permissions

### The `getConditions()` Function

Each scope defines a `getConditions()` function that returns CASL conditions based on context:

```typescript
// packages/common/src/authorization/scopes.ts

{
    name: 'manage:Dashboard@space',
    description: 'Edit dashboards in spaces where you have editor or admin access',
    isEnterprise: false,
    group: ScopeGroup.CONTENT,
    getConditions: (context) => [
        // Returns conditions for CASL - user must have editor OR admin role in space
        addAccessCondition(context, SpaceMemberRole.EDITOR),
        addAccessCondition(context, SpaceMemberRole.ADMIN),
    ],
}
```

### Scope Context

The `ScopeContext` provides runtime information for condition evaluation:

```typescript
// packages/common/src/types/scopes.ts

type ScopeContext = {
    userUuid: string;
    scopes: Set<ScopeName>;
    isEnterprise: boolean;
    organizationRole?: string;
    permissionsConfig?: {
        pat: { enabled: boolean; allowedOrgRoles: string[] };
    };
} & (
    | { organizationUuid: string; projectUuid?: never }
    | { projectUuid: string; organizationUuid?: never }
);
```

### Condition Builders

**`addUuidCondition`** - Adds project/org UUID to conditions:
```typescript
const addUuidCondition = (context, modifiers) => ({
    ...(context.organizationUuid
        ? { organizationUuid: context.organizationUuid }
        : { projectUuid: context.projectUuid }),
    ...modifiers,
});
```

**`addAccessCondition`** - Adds space access requirements:
```typescript
const addAccessCondition = (context, role) => ({
    ...addUuidCondition(context),
    access: {
        $elemMatch: {
            userUuid: context.userUuid || false,
            ...(role ? { role } : {}),
        },
    },
});
```

---

## Permission Builders

### Key Files

| Builder | Location | Purpose |
|---------|----------|---------|
| `getUserAbilityBuilder` | `packages/common/src/authorization/index.ts` | Main entry - builds user's complete ability |
| `buildAbilityFromScopes` | `packages/common/src/authorization/scopeAbilityBuilder.ts` | Converts scopes to CASL rules |
| `projectMemberAbilities` | `packages/common/src/authorization/projectMemberAbility.ts` | System role → CASL for projects |
| `applyOrganizationMemberAbilities` | `packages/common/src/authorization/organizationMemberAbility.ts` | Org role → CASL |
| `PROJECT_ROLE_TO_SCOPES_MAP` | `packages/common/src/authorization/roleToScopeMapping.ts` | Maps system roles to scope arrays |

### `getUserAbilityBuilder` Flow

```typescript
// packages/common/src/authorization/index.ts

export const getUserAbilityBuilder = ({
    user,
    projectProfiles,
    permissionsConfig,
    customRoleScopes,
    customRolesEnabled,
    isEnterprise,
}) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);

    // 1. Apply organization-level abilities
    applyOrganizationMemberAbilities({
        role: user.role,
        member: { organizationUuid, userUuid },
        builder,
        permissionsConfig,
    });

    // 2. Apply project-level abilities for each project
    projectProfiles.forEach((profile) => {
        if (profile.roleUuid && customRolesEnabled) {
            // Custom role → use scopes
            buildAbilityFromScopes({
                projectUuid: profile.projectUuid,
                userUuid: user.userUuid,
                scopes: customRoleScopes[profile.roleUuid],
                isEnterprise,
            }, builder);
        } else {
            // System role → use predefined abilities
            projectMemberAbilities[profile.role](profile, builder);
        }
    });

    return builder;
};
```

---

## How Permissions Work in the App

### Backend Enforcement

Permissions are checked in the service layer using `user.ability.cannot()`:

```typescript
// packages/backend/src/services/PinningService/PinningService.ts:113

if (user.ability.cannot('manage', subject('PinnedItems', project))) {
    throw new ForbiddenError('You do not have permission to pin items');
}
```

**Common Pattern:**
```typescript
import { subject } from '@casl/ability';
import { ForbiddenError } from '@lightdash/common';

// Check permission
if (user.ability.cannot('action', subject('Subject', { projectUuid, ...conditions }))) {
    throw new ForbiddenError('Custom error message');
}
```

**Error Types:**
- `ForbiddenError` (403) - User authenticated but lacks permission
- `AuthorizationError` (401) - User not authenticated

### Frontend Enforcement

Frontend uses `user.ability.can()` for conditional rendering:

```typescript
// packages/frontend/src/pages/Settings.tsx

// Via user object from useUser hook
const { user } = useUser();

// Conditional rendering
{user?.ability.can('manage', 'PersonalAccessToken') && (
    <MenuItem>Personal Access Tokens</MenuItem>
)}

// Conditional logic
if (user?.ability.can('manage', 'Organization')) {
    // Show admin options
}
```

**AbilityContext** (available but user.ability is more common):
```typescript
// packages/frontend/src/providers/Ability/context.ts
import { AbilityContext } from './context';
const ability = useContext(AbilityContext);
```

### PAT (Personal Access Token) Permissions

PAT permissions are dynamic based on organization config:

```typescript
// packages/common/src/authorization/scopeAbilityBuilder.ts

const handlePatConfigApplication = (context, builder) => {
    const { pat } = context?.permissionsConfig || {};

    // Add PAT permission if enabled for user's org role
    if (pat?.enabled && pat?.allowedOrgRoles?.includes(context.organizationRole)) {
        builder.can('manage', 'PersonalAccessToken');
    }
};
```

### Embedded (JWT) Permissions

Embedded dashboards use limited, token-based permissions for anonymous users.

---

## How to Add a New Scope/Permission

### Step 1: Define the Scope

Add to `packages/common/src/authorization/scopes.ts`:

```typescript
{
    name: 'manage:NewFeature',  // Format: action:Subject or action:Subject@modifier
    description: 'Description shown in custom role UI',
    isEnterprise: false,  // true for enterprise-only features
    group: ScopeGroup.PROJECT_MANAGEMENT,  // Choose appropriate group
    getConditions: (context) => [
        addUuidCondition(context),  // Use helper or custom conditions
    ],
},
```

### Step 2: Add CASL Subject (if new subject type)

If your scope uses a new subject, add to `packages/common/src/authorization/types.ts`:

```typescript
export type CaslSubjectNames =
    | 'AiAgent'
    | 'Dashboard'
    | 'NewFeature'  // Add here alphabetically
    | // ...
```

### Step 3: Add to System Role Mapping

Add to `packages/common/src/authorization/roleToScopeMapping.ts`. This makes the scope available via system roles:

```typescript
const BASE_ROLE_SCOPES = {
    [ProjectMemberRole.DEVELOPER]: [
        // ... existing scopes
        'manage:NewFeature',  // Add to appropriate role
    ],
};
```

### Step 4: Update System Role Ability Builder

Add to `packages/common/src/authorization/projectMemberAbility.ts`:

```typescript
developer(member, { can }) {
    projectMemberAbilities.editor(member, { can });
    // ... existing abilities
    can('manage', 'NewFeature', {
        projectUuid: member.projectUuid,
    });
},
```

If org-level, also update `packages/common/src/authorization/organizationMemberAbility.ts`.

### Step 5: Enforce in Service Layer

Add permission check in your service:

```typescript
// packages/backend/src/services/NewFeatureService.ts

import { subject } from '@casl/ability';
import { ForbiddenError } from '@lightdash/common';

async updateFeature(user: SessionUser, projectUuid: string, data: UpdateData) {
    if (user.ability.cannot('manage', subject('NewFeature', { projectUuid }))) {
        throw new ForbiddenError('You do not have permission to manage this feature');
    }
    // ... implementation
}
```

### Step 6: Add Frontend Checks

Add UI permission checks:

```typescript
// In React component
const { user } = useUser();

if (user?.ability.can('manage', 'NewFeature')) {
    return <NewFeatureButton />;
}
return null;
```

### Step 7: Test the Permission

1. **Unit test** the scope conditions
2. **Integration test** the service enforcement
3. **E2E test** the full flow with different roles

---

## Backwards Compatibility

When modifying permissions, consider the impact on existing customers—especially self-hosted deployments that may not receive automatic updates.

### Guiding Principles

1. **New scopes must be added to system roles** - Customers using system roles (viewer, editor, admin, etc.) should automatically get access to new features without manual configuration.

2. **Don't break existing permission checks** - Changing what an existing scope controls can break custom roles. Self-hosted customers can't automatically update their custom role configurations.

3. **Can new behavior use existing scopes?** - Before creating a new scope, ask: does an existing scope already cover this action? Reusing scopes reduces complexity.

4. **Use deprecation patterns for existing behavior changes** - Never silently change what a permission controls.

### Changing Existing Behavior

If you need to change what a permission controls:

**Step 1: Keep old behavior working**
```typescript
// Keep the old scope working
{
    name: 'manage:Dashboard',
    // ... still controls what it always did
}
```

**Step 2: Add new scope for new behavior**
```typescript
// Add new scope with clear naming
{
    name: 'manage:DashboardAdvanced',
    description: 'Advanced dashboard features (v2)',
    // ...
}
```

**Step 3: Add to system roles**
```typescript
// Ensure system role users get new capability
[ProjectMemberRole.EDITOR]: [
    'manage:Dashboard',        // Keep existing
    'manage:DashboardAdvanced', // Add new
],
```

**Step 4: Document the deprecation**
```typescript
// scopes.ts - Add deprecation notice in description
{
    name: 'manage:Dashboard',
    description: '[DEPRECATED: Use manage:DashboardAdvanced for X] Manage dashboards',
    // ...
}
```

### Custom Roles Considerations

Custom roles are stored in the database with explicit scope names. When you:

| Change | Impact on Custom Roles |
|--------|------------------------|
| Add new scope | No impact - available for assignment |
| Rename scope | **BREAKING** - Custom roles lose permission |
| Remove scope | **BREAKING** - Custom roles lose permission |
| Change scope behavior | **SILENT BREAKING** - Custom roles affected |

**For self-hosted customers:**
- Database migrations can add new scopes to system roles
- Cannot automatically update custom role `scoped_roles` entries
- Must provide clear upgrade documentation

### Deprecation Checklist

When deprecating a scope:

- [ ] Create replacement scope with new behavior
- [ ] Add replacement scope to appropriate system roles
- [ ] Update description of old scope with deprecation notice
- [ ] Add migration guide to release notes
- [ ] Plan removal timeline (2+ major versions recommended)
- [ ] Add console warning when deprecated scope is checked

---

## Database Schema

### `roles` Table

```sql
CREATE TABLE roles (
    role_uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organization_uuid UUID REFERENCES organizations(organization_uuid),
    owner_type VARCHAR(50) NOT NULL CHECK (owner_type IN ('user', 'system')),
    created_by UUID REFERENCES users(user_uuid),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_uuid, name)
);
```

### `scoped_roles` Table

```sql
CREATE TABLE scoped_roles (
    role_uuid UUID NOT NULL REFERENCES roles(role_uuid) ON DELETE CASCADE,
    scope_name VARCHAR(255) NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by UUID REFERENCES users(user_uuid),
    PRIMARY KEY (role_uuid, scope_name)
);
```

### Role Assignment

Roles are assigned via membership tables:
- `project_memberships.role_uuid`
- `organization_memberships.role_uuid`
- `project_group_access.role_uuid`

---

## Key Files Reference

### Common Package (`packages/common/src/`)

| File | Purpose |
|------|---------|
| `authorization/scopes.ts` | All 70+ scope definitions |
| `authorization/types.ts` | CASL action/subject types |
| `authorization/index.ts` | `getUserAbilityBuilder` entry point |
| `authorization/scopeAbilityBuilder.ts` | Scope → CASL conversion |
| `authorization/projectMemberAbility.ts` | Project system role abilities |
| `authorization/organizationMemberAbility.ts` | Org system role abilities |
| `authorization/roleToScopeMapping.ts` | System role → scope mapping |
| `authorization/parseScopes.ts` | Scope name parsing utilities |
| `types/scopes.ts` | Scope type definitions, ScopeContext |

### Backend Package (`packages/backend/src/`)

| File | Purpose |
|------|---------|
| `models/RolesModel.ts` | Role CRUD operations |
| `services/RolesService/RolesService.ts` | Role business logic |
| `controllers/OrganizationRolesController.ts` | Org role API endpoints |
| `controllers/ProjectRolesController.ts` | Project role API endpoints |
| `database/migrations/20250807212731_add_custom_roles.ts` | Schema migration |

### Frontend Package (`packages/frontend/src/`)

| File | Purpose |
|------|---------|
| `providers/Ability/AbilityProvider.tsx` | AbilityContext provider |
| `providers/Ability/context.ts` | AbilityContext definition |
| `hooks/user/useUser.ts` | User hook with ability access |

---

## Common Patterns & Examples

### Adding an Enterprise-Only Scope

```typescript
// scopes.ts
{
    name: 'manage:AdvancedAnalytics',
    description: 'Access advanced analytics features',
    isEnterprise: true,  // This is the key flag
    group: ScopeGroup.DATA,
    getConditions: addDefaultUuidCondition,
}
```

Enterprise scopes are filtered out when `isEnterprise: false` in context.

### Adding a Scope with Space-Level Conditions

```typescript
// scopes.ts
{
    name: 'manage:Report@space',
    description: 'Manage reports in spaces where you have editor access',
    isEnterprise: false,
    group: ScopeGroup.CONTENT,
    getConditions: (context) => [
        addAccessCondition(context, SpaceMemberRole.EDITOR),
        addAccessCondition(context, SpaceMemberRole.ADMIN),
    ],
}
```

### Checking Multiple Permissions

```typescript
// Backend - any of multiple permissions
const canManage = user.ability.can('manage', subject('Dashboard', { projectUuid }));
const canCreate = user.ability.can('create', subject('Dashboard', { projectUuid }));

if (!canManage && !canCreate) {
    throw new ForbiddenError('...');
}

// Frontend - combining checks
const canEdit = user?.ability.can('manage', 'Dashboard')
    || user?.ability.can('update', 'Dashboard');
```

### Dynamic Permissions Based on Resource State

```typescript
// Check permission with resource conditions
const dashboard = await getDashboard(dashboardUuid);

if (user.ability.cannot('manage', subject('Dashboard', {
    projectUuid: dashboard.projectUuid,
    isPrivate: dashboard.isPrivate,
    access: dashboard.access,  // Space access array
}))) {
    throw new ForbiddenError('...');
}
```

---

## CASL Ability Checks Deep Dive

Understanding how CASL evaluates permissions is critical for writing correct authorization code. CASL uses MongoDB-style query matching for conditions.

### The `manage` Action (Super Permission)

`manage` is a special CASL keyword that matches **all actions** (create, view, update, delete, export, etc.):

```typescript
// Ability definition
can('manage', 'Dashboard', { projectUuid: 'abc-123' });

// All of these return TRUE:
ability.can('view', subject('Dashboard', { projectUuid: 'abc-123' }));    // ✅
ability.can('update', subject('Dashboard', { projectUuid: 'abc-123' }));  // ✅
ability.can('delete', subject('Dashboard', { projectUuid: 'abc-123' }));  // ✅
ability.can('create', subject('Dashboard', { projectUuid: 'abc-123' }));  // ✅
ability.can('manage', subject('Dashboard', { projectUuid: 'abc-123' }));  // ✅
```

**Use case:** Admin roles typically use `manage` for full control:
```typescript
// projectMemberAbility.ts - Admin gets full control
can('manage', 'Dashboard', { projectUuid: member.projectUuid });
```

### Condition Matching: Exact Match

When the permission check conditions exactly match the ability conditions:

```typescript
// Ability definition
can('view', 'Dashboard', { projectUuid: 'abc-123', isPrivate: false });

// Check with exact same conditions
ability.can('view', subject('Dashboard', {
    projectUuid: 'abc-123',
    isPrivate: false
}));  // ✅ TRUE - exact match
```

### Condition Matching: Check Has Fewer Properties Than Ability

When the ability has conditions but the check provides fewer properties:

```typescript
// Ability definition - requires projectUuid AND isPrivate
can('view', 'Dashboard', { projectUuid: 'abc-123', isPrivate: false });

// Check with MISSING condition property
ability.can('view', subject('Dashboard', {
    projectUuid: 'abc-123'
    // Missing isPrivate!
}));  // ❌ FALSE - isPrivate condition cannot be verified
```

**Why?** CASL cannot verify the `isPrivate: false` condition if the property isn't provided. This is a **secure default** - missing data means deny.

### Condition Matching: Check Has More Properties Than Ability

When the check provides more properties than the ability requires:

```typescript
// Ability definition - only checks projectUuid
can('view', 'Dashboard', { projectUuid: 'abc-123' });

// Check with EXTRA properties
ability.can('view', subject('Dashboard', {
    projectUuid: 'abc-123',
    isPrivate: true,           // Extra - ignored
    name: 'My Dashboard',      // Extra - ignored
    createdAt: new Date()      // Extra - ignored
}));  // ✅ TRUE - projectUuid matches, extras are ignored
```

**Why?** CASL only checks conditions defined in the ability. Extra properties on the subject don't affect the result.

### Condition Matching: Value Mismatch

When condition values don't match:

```typescript
// Ability definition
can('view', 'Dashboard', { projectUuid: 'abc-123' });

// Check with different projectUuid
ability.can('view', subject('Dashboard', {
    projectUuid: 'xyz-789'  // Different value!
}));  // ❌ FALSE - projectUuid doesn't match
```

### Complex Conditions: $elemMatch

For array-based conditions like space access:

```typescript
// Ability definition - user must have EDITOR role in space access array
can('manage', 'Dashboard', {
    projectUuid: 'abc-123',
    access: {
        $elemMatch: {
            userUuid: 'user-456',
            role: 'editor'
        }
    }
});

// Check - user IS in access array with editor role
ability.can('manage', subject('Dashboard', {
    projectUuid: 'abc-123',
    access: [
        { userUuid: 'user-456', role: 'editor' },  // ✅ Matches!
        { userUuid: 'user-789', role: 'viewer' }
    ]
}));  // ✅ TRUE

// Check - user is NOT in access array
ability.can('manage', subject('Dashboard', {
    projectUuid: 'abc-123',
    access: [
        { userUuid: 'other-user', role: 'editor' }  // Different user
    ]
}));  // ❌ FALSE
```

### Multiple Abilities (OR Logic)

When multiple `can()` calls define the same action/subject, they're combined with OR:

```typescript
// Ability definitions - user can view if EITHER condition is met
can('view', 'Dashboard', { isPrivate: false });                        // Public dashboards
can('view', 'Dashboard', { access: { $elemMatch: { userUuid: 'user-123' } } }); // Dashboards they have access to

// Check public dashboard (no access entry for user)
ability.can('view', subject('Dashboard', {
    isPrivate: false,
    access: []
}));  // ✅ TRUE - matches first rule

// Check private dashboard with access
ability.can('view', subject('Dashboard', {
    isPrivate: true,
    access: [{ userUuid: 'user-123', role: 'viewer' }]
}));  // ✅ TRUE - matches second rule

// Check private dashboard without access
ability.can('view', subject('Dashboard', {
    isPrivate: true,
    access: [{ userUuid: 'other-user', role: 'viewer' }]
}));  // ❌ FALSE - matches neither rule
```

### Common Mistakes

**Forgetting to pass conditions in the check**
```typescript
// Ability requires projectUuid
can('view', 'Dashboard', { projectUuid: 'abc-123' });

// BAD: Check without subject() - no conditions to match
ability.can('view', 'Dashboard');  // ❌ FALSE - no conditions provided

// GOOD: Check with subject() and conditions
ability.can('view', subject('Dashboard', { projectUuid: 'abc-123' }));  // ✅ TRUE
```

---

## Troubleshooting

### Permission Denied Unexpectedly

1. Check the scope exists in `scopes.ts`
2. Verify the scope is in the user's role (system or custom)
3. Check `isEnterprise` flag matches deployment
4. Verify conditions match the resource being accessed
5. Check for typos in subject name (case-sensitive)

### Custom Role Not Working

1. Ensure `customRolesEnabled` is true
2. Verify role is assigned via `project_memberships.role_uuid`
3. Check `scoped_roles` has the expected scopes
4. Confirm scopes are valid (exist in `scopes.ts`)

### Frontend Permission Check Not Updating

1. Ensure user data is refetched after role changes
2. Check TanStack Query cache invalidation
3. Verify the ability object is being read from fresh user data

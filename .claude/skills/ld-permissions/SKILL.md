---
name: ld-permissions
description: Guide for Lightdash's CASL-based authorization system. Use when working with scopes, custom roles, abilities, permissions, ForbiddenError, authorization, or access control. Helps with adding new scopes, debugging permission issues, understanding the permission flow, and creating custom roles.
allowed-tools: Read, Grep, Glob, Task
---

# Permissions & Authorization Guide

This skill helps you work with Lightdash's CASL-based permissions system, including scopes, custom roles, and authorization enforcement.

## What do you need help with?

1. **Add a new scope/permission** - Step-by-step guide to add a new permission
2. **Debug a permission issue** - Troubleshoot why a user can't access something
3. **Understand the permission flow** - Learn how permissions work end-to-end
4. **Work with custom roles** - Create or modify custom roles with specific scopes

## Quick Reference

### Key Files

| Purpose | Location |
|---------|----------|
| Scope definitions | `packages/common/src/authorization/scopes.ts` |
| CASL types | `packages/common/src/authorization/types.ts` |
| Ability builder | `packages/common/src/authorization/index.ts` |
| System role abilities | `packages/common/src/authorization/projectMemberAbility.ts` |
| Role-to-scope mapping | `packages/common/src/authorization/roleToScopeMapping.ts` |
| Scope-to-CASL conversion | `packages/common/src/authorization/scopeAbilityBuilder.ts` |

### Common Patterns

**Backend permission check:**
```typescript
import { subject } from '@casl/ability';
import { ForbiddenError } from '@lightdash/common';

if (user.ability.cannot('manage', subject('Dashboard', { projectUuid }))) {
    throw new ForbiddenError('You do not have permission');
}
```

**Frontend permission check:**
```typescript
const { user } = useUser();

if (user?.ability.can('manage', 'Dashboard')) {
    return <EditButton />;
}
```

or wrap in a CASL component:

```tsx
import { Can } from '../../providers/Ability';

<Can I="manage" a="Dashboard">
    <EditButton />
</Can>
```

## Full Documentation

For comprehensive documentation, read: `.context/PERMISSIONS.md`

This includes:
- Architecture diagram showing the complete permission flow
- All scope groups and modifiers (@self, @public, @space, etc.)
- Database schema for custom roles
- Step-by-step guide to add new scopes
- Troubleshooting guide

## Adding a New Scope (Quick Guide)

1. **Define scope** in `packages/common/src/authorization/scopes.ts`:
```typescript
{
    name: 'manage:NewFeature',
    description: 'Description for custom role UI',
    isEnterprise: false,
    group: ScopeGroup.PROJECT_MANAGEMENT,
    getConditions: (context) => [addUuidCondition(context)],
}
```

2. **Add subject** (if new) in `packages/common/src/authorization/types.ts`

3. **Add to system role** in `packages/common/src/authorization/roleToScopeMapping.ts`

4. **Update ability builder** in `packages/common/src/authorization/projectMemberAbility.ts`

5. **Enforce in service** with `user.ability.cannot()` check

6. **Add frontend check** with `user?.ability.can()`

## Debugging Permission Issues

When a user gets "ForbiddenError":

1. **Check scope exists** - Is the scope defined in `scopes.ts`?
2. **Check role assignment** - Does the user's role include this scope?
3. **Check conditions** - Do the CASL conditions match the resource?
4. **Check enterprise flag** - Is `isEnterprise: true` but deployment isn't enterprise?
5. **Check subject name** - Case-sensitive match in `CaslSubjectNames`?

Use grep to find where the permission is checked:
```bash
grep -r "ability.cannot.*'manage'.*'YourSubject'" packages/backend/src/services/
```

Please describe what you're trying to accomplish, or ask me to explain any aspect of the permissions system.
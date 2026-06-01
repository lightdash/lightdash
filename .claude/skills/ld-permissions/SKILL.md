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

### CASL Subject Scoping: Resource, Not Actor

CASL actor is passed before the check:

```typescript
getUserAbilityBuilder({
    user: lightdashUser, // actor
    projectProfiles,
    permissionsConfig,
});

const ability = this.createAuditedAbility(accountOrUser); // actor
```

`subject(...)` must describe only the target resource:

```typescript
ability.can(
    'manage',
    subject('X', {
        organizationUuid: target.organizationUuid,
        projectUuid: target.projectUuid,
    }),
);
```

Never fill `subject(...)` from actor fields like `user.organizationUuid`. Org-level grants may only check `organizationUuid`, so actor-sourced subject fields can become cross-org access on multi-org instances. Single-org dev hides it.

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

## Changing the Scope Vocabulary (Migrating Custom Roles)

Custom roles persist scope names as strings in the `scoped_roles` table (`role_uuid`, `scope_name`, `granted_by`). They are decoupled from system roles and **do not auto-update** when the scope vocabulary changes. Any rename / split / merge / removal must include a Knex migration that reconciles existing rows, otherwise self-hosted instances silently lose or retain permissions.

**Before merging a scope change, evaluate the impact and write a migration:**

| Change | Impact on `scoped_roles` | Required migration |
|--------|--------------------------|--------------------|
| **Rename a scope** (e.g. `manage:Foo` → `manage:Bar`) | Old rows reference a name that no longer exists in `scopes.ts`. `parseScopes` drops them as invalid, silently revoking access. | `UPDATE scoped_roles SET scope_name = 'new' WHERE scope_name = 'old'` |
| **Split one scope into two** (e.g. `manage:CustomSql` → `manage:CustomSql` + `manage:CustomFields`) | Roles with the original scope lose access to whichever capability moved to the new scope. | Backfill the new scope for every role that has the original (`INSERT ... SELECT ... ON CONFLICT DO NOTHING`). See `20260417111420_grant_custom_fields_to_custom_sql_roles.ts`. |
| **Merge two scopes into one** | Roles with only one of the merged scopes may gain or lose capability. | Insert the merged scope where either source exists; then delete the old rows. |
| **Remove a scope** | Rows reference a non-existent scope name, spamming `Invalid scope: ...` warnings from `parseScopes` on every request. | Delete the orphaned rows. See `20260519142606_remove_legacy_dashboard_export_scopes.ts`. |
| **Tighten conditions on an existing scope** | No row change needed, but the behavioral change is invisible to operators. | None on the table; note in PR description. |
| **Add a brand-new scope** | No existing rows are affected. Only system roles in `roleToScopeMapping.ts` need updating. | None for custom roles. |

**Migration conventions** (see `packages/backend/src/database/CLAUDE.md` for general safe-migration rules):

- Wrap the body in `try/catch` and log a recoverable manual-fix command on failure. These backfills are best-effort cleanup — failing them should never block subsequent migrations.
- Use `ON CONFLICT DO NOTHING` for inserts since `(role_uuid, scope_name)` is the natural unique key.
- Preserve `granted_by` from the source row when copying a scope, so audit history points back at the original grantor rather than `NULL`.
- Provide a sensible `down()` — usually deleting the rows the `up()` inserted. If the change is irreversible (legacy cleanup), document why `down()` is a no-op.

**Checklist when changing the scope vocabulary:**

1. Determine which change type applies (rename / split / merge / remove / add / tighten).
2. If a migration is required, create it with `pnpm -F backend create-migration <name>` and follow the patterns above.
3. Update `roleToScopeMapping.ts` so system roles reflect the new vocabulary, and run the parity test.
4. Call this out in the PR description so reviewers can verify the data migration matches the code change.

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

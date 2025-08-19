# Backend Role System Documentation

This document explains how the role system works in Lightdash backend, including the current "fixed roles" system and the new "custom roles" system under development.

## Overview

Lightdash uses a hierarchical role system with CASL-based permissions that determine what users and groups can access and modify within the platform. Roles are assigned at both organization and project levels, with project-level roles taking precedence when both exist.

## Current Fixed Role System

### Role Hierarchy

The current system uses predefined roles with fixed permissions:

1. **VIEWER** - Can view public dashboards, charts, and spaces
2. **INTERACTIVE_VIEWER** - Viewer + can explore data, export, create scheduled deliveries
3. **EDITOR** - Interactive Viewer + can create/edit content, manage spaces
4. **DEVELOPER** - Editor + can manage SQL, validations, custom views, compile projects  
5. **ADMIN** - Developer + can manage projects, users, and all content

### Key Files for Fixed Roles

- `packages/common/src/types/projectMemberRole.ts` - Defines the `ProjectMemberRole` enum and role hierarchy
- `packages/common/src/utils/projectMemberRole.ts` - Role conversion utilities between organization/project/space contexts
- `packages/common/src/authorization/projectMemberAbility.ts` - CASL permission definitions for each role

### Permission System (CASL)

Each role maps to specific CASL abilities defined in `projectMemberAbility.ts`:

```typescript
export const projectMemberAbilities: Record<
    ProjectMemberRole,
    (member, builder) => void
> = {
    viewer(member, { can }) {
        can('view', 'Dashboard', { projectUuid: member.projectUuid, isPrivate: false });
        can('view', 'SavedChart', { projectUuid: member.projectUuid, isPrivate: false });
        // ... more permissions
    },
    // ... other roles build on top of previous ones
}
```

### Role Assignment Tables

- **Organization Level**: `organization_memberships.role` (enum value)
- **Project Level**: `project_memberships.role` (enum value) 
- **Group Project Access**: `project_group_access.role` (enum value)

## New Custom Role System (In Development)

The custom role system introduces flexible, organization-specific roles with granular scope-based permissions.

### Database Schema

#### New Tables

1. **`roles`** - Custom role definitions
   - `role_uuid` - Unique identifier
   - `name` - Human-readable role name  
   - `description` - Optional role description
   - `organization_uuid` - Organization that owns this role
   - `created_by` - User who created the role
   - `owner_type` - 'user' or 'system' (for built-in roles)
   - `created_at` / `updated_at` - Timestamps

2. **`scoped_roles`** - Permission scopes assigned to roles
   - `role_uuid` - Reference to role
   - `scope_name` - Permission scope (e.g., "view:dashboard")
   - `granted_by` - User who granted this scope
   - `granted_at` - When scope was granted

3. **`user_roles`** - User role assignments (project-level)
   - `user_uuid` - User being assigned
   - `role_uuid` - Role being assigned  
   - `organization_uuid` - Organization context
   - `project_uuid` - Project scope of assignment

#### Modified Tables

Existing membership tables now have nullable `role_uuid` columns alongside the legacy `role` enum:

- `organization_memberships.role_uuid` - Custom organization role
- `project_memberships.role_uuid` - Custom project role  
- `project_group_access.role_uuid` - Custom group project role

### Scope-Based Permissions

Scopes will be defined as constants in the application code:

```typescript
type Scope = {
  name: Lowercase<`${AbilityAction}:${CaslSubject}`>, // e.g., "view:dashboard"
  description: string,
  isCommercial: boolean // Filter out EE features for non-licensed orgs
}
```

Examples:
- `"view:dashboard"` - Can view dashboards
- `"manage:space"` - Can create/edit/delete spaces  
- `"manage:project"` - Can modify project settings
- `"view:aiagent"` - Can access AI agent features (EE only)

### Migration Strategy

1. **Coexistence Period**: Both old enum roles and new custom roles work simultaneously
2. **Custom Role Priority**: When `role_uuid` is set, it takes precedence over the legacy `role` enum
3. **Backward Compatibility**: Existing role enum values continue to work via `projectMemberAbilities`
4. **Gradual Migration**: Legacy role columns can be deprecated once custom roles are fully adopted

## Key Models and Services

### RolesModel (`packages/backend/src/models/RolesModel.ts`)

Handles database operations for custom roles:

- `createRole()` - Create new custom role
- `getRolesByOrganizationUuid()` - List roles for organization
- `assignRoleToUser()` - Assign role to user (org or project level)
- `addScopesToRole()` - Grant permission scopes to role
- `getProjectAccess()` - Get user/group access for project (supports both role types)

### RolesService (`packages/backend/src/ee/services/RolesService.ts`)

Enterprise service for role management:

- Role CRUD operations with authorization checks
- User/group role assignment at organization and project levels
- Scope management for custom roles
- Analytics tracking for role operations

## Areas Requiring Updates for Custom Roles

### TODO Comments Found

Several files contain TODO comments indicating where custom role support needs to be added:

1. `packages/common/src/utils/projectMemberRole.ts:15` - "TODO include custom roles"
2. `packages/common/src/utils/projectMemberRole.ts:116` - "TODO include custom roles"  

### Key Modification Areas

1. **Permission Resolution**: Update ability calculation to use scopes when `role_uuid` is present instead of fixed role abilities

2. **Role Conversion Functions**: Update utilities in `projectMemberRole.ts` to handle custom roles

3. **User/Group Access Queries**: Modify queries to check both `role` and `role_uuid` columns, prioritizing custom roles

4. **Frontend Role Display**: Update UI to show custom role names instead of enum labels when applicable

5. **Migration Scripts**: Create migrations to handle space share data and other role-dependent data

6. **API Responses**: Ensure APIs return appropriate role information (name vs enum) based on assignment type

## Implementation Status

- ✅ Database schema defined (`packages/backend/src/database/entities/roles.ts`)
- ✅ RolesModel implemented with full CRUD operations
- ✅ RolesService implemented with authorization and analytics
- ⏳ Permission resolution system (CASL integration with scopes)
- ⏳ Role conversion utilities updated
- ⏳ Frontend integration
- ⏳ Migration of existing role-dependent logic

## Testing Considerations

- Test both fixed and custom role systems work simultaneously
- Verify custom roles take precedence when both are assigned
- Test permission inheritance across organization/project/space levels
- Validate scope filtering for non-EE organizations
- Test role assignment/unassignment flows
- Verify analytics tracking for role operations

---

*This documentation reflects the role system as of the current implementation. As custom roles are fully implemented, this document should be updated to reflect the complete system.*
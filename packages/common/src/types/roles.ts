import type { ApiSuccessEmpty } from './api/success';
import type { OrganizationMemberRole } from './organizationMemberProfile';
import type { ProjectMemberRole } from './projectMemberRole';
import type { PromotionAction } from './promotion';

export type RoleLevel = 'project' | 'organization';

/**
 * Complete set of roles held at one level: at most one system role plus any
 * number of custom roles. Permissions are the union of all held roles.
 */
export type OrganizationRoleSet = {
    systemRole: OrganizationMemberRole | null;
    customRoleUuids: string[];
};

export type ProjectRoleSet = {
    systemRole: ProjectMemberRole | null;
    customRoleUuids: string[];
};

export type ProjectAccess = {
    projectUuid: string;
    userUuid: string;
    roleUuid: string;
    roleName: string;
    firstName: string;
    lastName: string;
    hasMultipleRoles?: boolean;
};

export type GroupProjectAccess = {
    groupUuid: string;
    projectUuid: string;
    roleUuid: string;
    roleName: string;
    groupName: string;
    hasMultipleRoles?: boolean;
};

export type Role = {
    roleUuid: string;
    name: string;
    description: string | null;
    level: RoleLevel;
    organizationUuid: string | null; // System roles don't have an organization
    ownerType: 'user' | 'system';
    createdBy: string | null;
    createdAt: Date | null; // System roles don't have dates
    updatedAt: Date | null;
};

export type RoleWithScopes = Role & {
    scopes: string[];
};

export type CreateRole = {
    name: string;
    description?: string;
    level?: RoleLevel;
    scopes?: string[];
};

export type UpdateRole = {
    name?: string;
    description?: string | null;
    scopes?: {
        add: string[];
        remove: string[];
    };
};

export type CustomRoleAsCode = {
    version: 1;
    name: string;
    description: string | null;
    level: RoleLevel;
    scopes: string[];
};

export type ApiCustomRoleAsCodeListResponse = {
    status: 'ok';
    results: {
        customRoles: CustomRoleAsCode[];
    };
};

export type ApiCustomRoleAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};

export type AddScopesToRole = {
    scopeNames: string[];
};

// API Response Types
export type ApiGetRolesResponse = {
    status: 'ok';
    results: Role[] | RoleWithScopes[];
};

export type ApiRoleWithScopesResponse = {
    status: 'ok';
    results: RoleWithScopes;
};

export type ApiDefaultRoleResponse = {
    status: 'ok';
    results: Role;
};

export type ApiDeleteRoleResponse = ApiSuccessEmpty;

export type ApiRemoveScopeFromRoleResponse = ApiSuccessEmpty;

export type ApiUnassignRoleFromUserResponse = ApiSuccessEmpty;

export type ApiGetProjectAccessResponse = {
    status: 'ok';
    results: {
        users: ProjectAccess[];
        groups: GroupProjectAccess[];
    };
};

// Unified Assignment Types
export type RoleAssignment = {
    roleId: string;
    roleName: string;
    ownerType: 'user' | 'system';
    assigneeType: 'user' | 'group';
    assigneeId: string;
    assigneeName: string;
    organizationId?: string; // for org-level assignments
    projectId?: string; // for project-level assignments
    createdAt: Date;
    updatedAt: Date;
    /** True when the assignee holds extra custom roles beyond `roleId` (see role sets). */
    hasMultipleRoles?: boolean;
};

export type ApiOrganizationRoleSetResponse = {
    status: 'ok';
    results: OrganizationRoleSet;
};

export type ApiProjectRoleSetResponse = {
    status: 'ok';
    results: ProjectRoleSet;
};

export type CreateRoleAssignmentRequest = {
    roleId: string;
    assigneeType: 'user' | 'group';
    assigneeId: string;
};

export type CreateUserRoleAssignmentRequest = {
    roleId: string;
};

export type CreateGroupRoleAssignmentRequest = {
    roleId: string;
};

export type UpdateRoleAssignmentRequest = {
    roleId: string;
};

export type UpsertUserRoleAssignmentRequest = {
    roleId: string;
    sendEmail?: boolean;
};

// API Response Types for Unified Assignments
export type ApiRoleAssignmentResponse = {
    status: 'ok';
    results: RoleAssignment;
};

export type ApiRoleAssignmentListResponse = {
    status: 'ok';
    results: RoleAssignment[];
};

// Assignees of a custom role — used by the delete-confirmation UI to show
// what's currently using a role before allowing deletion.
export type RoleAssigneeKind =
    | 'organization_user'
    | 'project_user'
    | 'project_group'
    | 'service_account';

export type RoleAssignee = {
    kind: RoleAssigneeKind;
    assigneeId: string; // userUuid | groupUuid | serviceAccountUuid
    assigneeName: string;
    projectUuid: string | null;
    projectName: string | null;
};

export type ApiRoleAssigneesResponse = {
    status: 'ok';
    results: RoleAssignee[];
};

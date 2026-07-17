import { ProjectMemberRole } from '../../types/projectMemberRole';

/**
 * Project-role equivalent of a custom role for space-access resolution.
 *
 * Custom-role assignments persist a placeholder `viewer` in the legacy `role`
 * column of `project_memberships` / `project_group_access`, so the role that
 * flows into inherited spaces must be derived from the custom role's scopes.
 * The marker scopes mirror the system-role tiers: `manage:Space` is first
 * granted at admin and `manage:Space@public` at editor, so the derived role
 * converts to the same space role as the system role the scopes came from.
 */
export const getProjectRoleForSpaceAccess = (
    scopes: string[],
): ProjectMemberRole => {
    if (scopes.includes('manage:Space')) {
        return ProjectMemberRole.ADMIN;
    }
    if (scopes.includes('manage:Space@public')) {
        return ProjectMemberRole.EDITOR;
    }
    return ProjectMemberRole.VIEWER;
};

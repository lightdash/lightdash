import {
    getHighestProjectRole,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ProjectRoleOrder,
} from '@lightdash/common';
import { type ProjectUserWithRole } from '../../hooks/useProjectUsersWithRoles';

export interface AgentUserAccessOption {
    userUuid: string;
    label: string;
    firstName: string;
    lastName: string;
    email: string;
    roleLabel: string;
}

const CUSTOM_ROLE_LABEL = 'Custom role';

/** How a user is named in the picker: full name, or email when unnamed. */
export const getAgentUserLabel = (user: {
    firstName: string;
    lastName: string;
    email: string;
}): string => `${user.firstName} ${user.lastName}`.trim() || user.email;

/**
 * Decides whether a project user is offered in the agent's user-access
 * picker, and how their role is labelled. Admins and developers are left out
 * because they can always manage agents. Everyone else needs at least
 * interactive-viewer access, which can come from a system role or from a
 * custom role; custom roles can't be ranked, so holding one counts as access.
 * Returns null when the user shouldn't be offered.
 */
export const getAgentUserAccessOption = (
    user: ProjectUserWithRole,
): AgentUserAccessOption | null => {
    const highestRole = user.inheritedRole
        ? getHighestProjectRole(user.inheritedRole)
        : undefined;

    const canCreateAiAgents =
        highestRole?.role === ProjectMemberRole.ADMIN ||
        highestRole?.role === ProjectMemberRole.DEVELOPER;

    if (canCreateAiAgents) return null;

    const hasInteractiveSystemRole =
        highestRole !== undefined &&
        ProjectRoleOrder[highestRole.role] >=
            ProjectRoleOrder[ProjectMemberRole.INTERACTIVE_VIEWER];

    if (!hasInteractiveSystemRole && !user.hasCustomRole) return null;

    return {
        userUuid: user.userUuid,
        label: getAgentUserLabel(user),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleLabel: hasInteractiveSystemRole
            ? ProjectMemberRoleLabels[highestRole.role]
            : CUSTOM_ROLE_LABEL,
    };
};

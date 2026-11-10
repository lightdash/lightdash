import {
    getAllScopesForRole,
    OrganizationMemberRole,
    OrganizationMemberRoleLabels,
    ProjectMemberRole,
} from '@lightdash/common';
import {
    AiAgentRequestingUser,
    AiAgentRequestingUserRole,
} from '../types/aiAgent';

const TECHNICAL_ROLES = new Set<OrganizationMemberRole>([
    OrganizationMemberRole.EDITOR,
    OrganizationMemberRole.DEVELOPER,
    OrganizationMemberRole.ADMIN,
]);

// Scopes exclusive to editor tier and above — the same threshold TECHNICAL_ROLES
// draws for system roles, applied to a custom role's scope list.
const TECHNICAL_SCOPES = (() => {
    const interactiveViewerScopes = new Set(
        getAllScopesForRole(ProjectMemberRole.INTERACTIVE_VIEWER),
    );
    return new Set(
        getAllScopesForRole(ProjectMemberRole.ADMIN).filter(
            (scope) => !interactiveViewerScopes.has(scope),
        ),
    );
})();

export const requestingUserRoleFromSystemRole = (
    role: OrganizationMemberRole,
): AiAgentRequestingUserRole => ({
    name: OrganizationMemberRoleLabels[role],
    isTechnical: TECHNICAL_ROLES.has(role),
});

export const requestingUserRoleFromCustomRole = (customRole: {
    name: string;
    scopes: string[];
}): AiAgentRequestingUserRole => ({
    name: customRole.name,
    isTechnical: customRole.scopes.some((scope) => TECHNICAL_SCOPES.has(scope)),
});

const BUSINESS_USER_GUIDANCE = `Treat them as a business user who consumes data rather than maintaining it:
- Answer in plain language, without data-modeling jargon (dbt, semantic layer, joins, table or model names as recommendations).
- Pick the best data source yourself and answer. Leave out advice to use a different table or explore, fix the data model or change the agent's configuration: they cannot act on it.
- When the available data cannot answer the question, say so simply and suggest they raise it with their data team.`;

const TECHNICAL_USER_GUIDANCE = `They maintain this project, so technical detail is appropriate: naming explores or fields, explaining modeling limitations, and suggesting semantic-layer changes are all fine when relevant.`;

const PROFILE_USE =
    'Let this profile shape your answers without reciting it back to the user or mentioning that you were given it.';

export const getRequestingUserSection = (
    requestingUser: AiAgentRequestingUser | null,
): string => {
    if (!requestingUser) return '';

    const { name, role, groups } = requestingUser;

    const identityParts: string[] = [];
    if (name) identityParts.push(name);
    if (role) identityParts.push(`organization role: ${role.name}`);
    if (groups.length > 0)
        identityParts.push(`member of: ${groups.join(', ')}`);

    // Unknown role → default to the safe, non-technical register.
    const guidance = role?.isTechnical
        ? TECHNICAL_USER_GUIDANCE
        : BUSINESS_USER_GUIDANCE;

    const teamGuidance =
        groups.length > 0
            ? "\nWhen a question is ambiguous, prefer the interpretation, metrics, and terminology most relevant to the user's team(s)."
            : '';

    if (!name) {
        const knownIdentity =
            identityParts.length > 0
                ? `\nWhat you know about them: ${identityParts.join(', ')}.\n`
                : '\n';

        return `## Who you are talking to

You don't know the user's name yet.
- Answer their request first. Then, once and at a natural moment (ideally the end of your first reply), ask for their first and last name so you can address them properly.
- When they give it, save it with updateUserName and greet them by first name.
- If they decline or ignore the request, do not ask again in this conversation.
${knownIdentity}
${guidance}${teamGuidance}
${PROFILE_USE}`;
    }

    return `## Who you are talking to

The user you are speaking with is ${identityParts.join(', ')}.

${guidance}${teamGuidance}
${PROFILE_USE}`;
};

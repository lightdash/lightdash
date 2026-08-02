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

const BUSINESS_USER_GUIDANCE = `Assume a business user consuming data, not someone who maintains it:
- Answer in plain language. Avoid data-modeling jargon (dbt, semantic layer, joins, table/model names as recommendations).
- Never advise them to use a different table or explore, fix the data model, or change the agent's configuration — they cannot act on that. Pick the best data source yourself and just answer.
- If the available data cannot answer the question, say so simply and suggest they raise it with their data team.`;

const TECHNICAL_USER_GUIDANCE = `They maintain this project, so technical detail is appropriate: naming explores or fields, explaining modeling limitations, and suggesting semantic-layer changes are all fine when relevant.`;

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

You don't yet know the user's name — it hasn't been collected.
- Answer their request first; never block on collecting the name.
- Then, once and at a natural moment (ideally at the end of your first reply), politely ask for their first and last name so you can address them properly.
- When they tell you their name, save it with the updateUserName tool and greet them by first name in your reply.
- If they decline or ignore the request, do not ask again in this conversation.
${knownIdentity}
${guidance}${teamGuidance}
Do not recite this profile back to the user or mention that you were given it; just let it shape your answers.`;
    }

    return `## Who you are talking to

The user you are speaking with is ${identityParts.join(', ')}.

${guidance}${teamGuidance}
Do not recite this profile back to the user or mention that you were given it; just let it shape your answers.
If the user asks to correct or change their name, use the updateUserName tool.`;
};

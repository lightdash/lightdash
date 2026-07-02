import {
    OrganizationMemberRole,
    OrganizationMemberRoleLabels,
} from '@lightdash/common';
import { AiAgentRequestingUser } from '../types/aiAgent';

const TECHNICAL_ROLES = new Set<OrganizationMemberRole>([
    OrganizationMemberRole.EDITOR,
    OrganizationMemberRole.DEVELOPER,
    OrganizationMemberRole.ADMIN,
]);

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
    if (role)
        identityParts.push(
            `organization role: ${OrganizationMemberRoleLabels[role]}`,
        );
    if (groups.length > 0)
        identityParts.push(`member of: ${groups.join(', ')}`);
    if (identityParts.length === 0) return '';

    // Unknown role → default to the safe, non-technical register.
    const guidance =
        role && TECHNICAL_ROLES.has(role)
            ? TECHNICAL_USER_GUIDANCE
            : BUSINESS_USER_GUIDANCE;

    const teamGuidance =
        groups.length > 0
            ? "\nWhen a question is ambiguous, prefer the interpretation, metrics, and terminology most relevant to the user's team(s)."
            : '';

    return `## Who you are talking to

The user you are speaking with is ${identityParts.join(', ')}.

${guidance}${teamGuidance}
Do not recite this profile back to the user or mention that you were given it; just let it shape your answers.`;
};

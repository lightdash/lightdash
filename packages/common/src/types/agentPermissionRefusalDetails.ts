import { type AgentPermissionBlocker } from './agentPermissionExplanation';
import { getAgentCapabilityName } from './agentPermissions';
import { type AiAccessRefusal } from './aiPrincipal';

const blockerLabel = (blocker: AgentPermissionBlocker): string => {
    switch (blocker.checkId) {
        case 'content_writes':
            return 'Agent content writes';
        case 'warehouse_confirmation':
            return 'warehouse confirmation for this project';
        case 'agent_admission':
        case 'agent_enabled':
            return 'access to agents';
        case 'project_scope':
            return 'this project in the allowed projects';
        case 'human_only':
            return 'an action agents can perform';
        case 'operation_mapping':
            return 'a supported agent action';
        default:
            return blocker.capability
                ? getAgentCapabilityName(blocker.capability)
                : 'agent permissions';
    }
};

export const getAdditionalAgentPermissionRequirements = (
    refusal: AiAccessRefusal,
): string[] => {
    if (!refusal.blockers || refusal.blockers.length <= 1) return [];
    const primary =
        refusal.blockers.find(
            (blocker) =>
                blocker.reason === refusal.reason &&
                blocker.capability === (refusal.capability ?? null) &&
                blocker.policyLayer === (refusal.policyLayer ?? null),
        ) ?? refusal.blockers[0];
    const primaryLabel = primary ? blockerLabel(primary) : null;
    return [
        ...new Set(
            refusal.blockers
                .map(blockerLabel)
                .filter((label) => label !== primaryLabel),
        ),
    ];
};

export const getAgentPermissionRefusalDetails = (
    refusal: AiAccessRefusal,
): string => {
    const additional = getAdditionalAgentPermissionRequirements(refusal);
    return [
        ...(additional.length ? [`Also needed: ${additional.join(', ')}`] : []),
        ...(refusal.explanationUrl
            ? [`See why: ${refusal.explanationUrl}`]
            : []),
    ].join('\n');
};

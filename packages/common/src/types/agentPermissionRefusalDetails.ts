import {
    DEFAULT_UI_STRINGS,
    type UiStringResolver,
} from '../utils/i18n/uiStrings';
import { type AgentPermissionBlocker } from './agentPermissionExplanation';
import { type AiAccessRefusal } from './aiPrincipal';

const blockerLabel = (
    blocker: AgentPermissionBlocker,
    getUiString: UiStringResolver,
): string => {
    switch (blocker.checkId) {
        case 'content_writes':
            return getUiString('aiAccess.requirements.contentWrites');
        case 'warehouse_confirmation':
            return getUiString('aiAccess.requirements.warehouseConfirmation');
        case 'agent_admission':
        case 'agent_enabled':
            return getUiString('aiAccess.requirements.agentAccess');
        case 'project_scope':
            return getUiString('aiAccess.requirements.allowedProjects');
        case 'human_only':
            return getUiString('aiAccess.requirements.agentAction');
        case 'operation_mapping':
            return getUiString('aiAccess.requirements.supportedAction');
        default:
            return blocker.capability
                ? getUiString(
                      `aiAccess.requirements.capabilities.${blocker.capability}`,
                  )
                : getUiString('aiAccess.requirements.agentPermissions');
    }
};

export const getAdditionalAgentPermissionRequirements = (
    refusal: AiAccessRefusal,
    getUiString: UiStringResolver = (key) => DEFAULT_UI_STRINGS[key],
): string[] => {
    if (!refusal.blockers || refusal.blockers.length <= 1) return [];
    const primary =
        refusal.blockers.find(
            (blocker) =>
                blocker.reason === refusal.reason &&
                blocker.capability === (refusal.capability ?? null) &&
                blocker.policyLayer === (refusal.policyLayer ?? null),
        ) ?? refusal.blockers[0];
    const primaryLabel = primary ? blockerLabel(primary, getUiString) : null;
    return [
        ...new Set(
            refusal.blockers
                .map((blocker) => blockerLabel(blocker, getUiString))
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

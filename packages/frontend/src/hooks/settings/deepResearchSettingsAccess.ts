import { type SettingsContext } from './types';

type DeepResearchSettingsAccess = Pick<
    SettingsContext,
    'isAiCopilotEnabled' | 'canManageOrgAiAgent' | 'hasAnyAiAgentAccess'
>;

export const canAccessDeepResearchSettings = ({
    isAiCopilotEnabled,
    canManageOrgAiAgent,
    hasAnyAiAgentAccess,
}: DeepResearchSettingsAccess) =>
    isAiCopilotEnabled && canManageOrgAiAgent && hasAnyAiAgentAccess;

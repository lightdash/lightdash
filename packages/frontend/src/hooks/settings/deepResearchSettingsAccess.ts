import { type SettingsContext } from './types';

type DeepResearchSettingsAccess = Pick<
    SettingsContext,
    'isAiCopilotEnabledOrTrial' | 'canManageOrgAiAgent' | 'hasAnyAiAgentAccess'
>;

export const canAccessDeepResearchSettings = ({
    isAiCopilotEnabledOrTrial,
    canManageOrgAiAgent,
    hasAnyAiAgentAccess,
}: DeepResearchSettingsAccess) =>
    isAiCopilotEnabledOrTrial && canManageOrgAiAgent && hasAnyAiAgentAccess;

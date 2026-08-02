import { type SettingsContext } from './types';

type DeepResearchSettingsAccess = Pick<
    SettingsContext,
    | 'isAiCopilotEnabledOrTrial'
    | 'isDeepResearchEnabled'
    | 'canManageOrgAiAgent'
    | 'hasAnyAiAgentAccess'
>;

export const canAccessDeepResearchSettings = ({
    isAiCopilotEnabledOrTrial,
    isDeepResearchEnabled,
    canManageOrgAiAgent,
    hasAnyAiAgentAccess,
}: DeepResearchSettingsAccess) =>
    isAiCopilotEnabledOrTrial &&
    isDeepResearchEnabled &&
    canManageOrgAiAgent &&
    hasAnyAiAgentAccess;

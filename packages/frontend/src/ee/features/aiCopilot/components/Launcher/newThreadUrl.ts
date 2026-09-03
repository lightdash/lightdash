import { type AiAgentSummary } from '@lightdash/common';
import { type LauncherPendingContext } from '../../store/aiAgentLauncherSlice';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../AgentSelector/AgentSelectorUtils';
import {
    isLauncherAutoAgent,
    type LAUNCHER_AUTO_AGENT,
} from './launcherAgentSelection';

type Args = {
    projectUuid: string;
    agent: AiAgentSummary | typeof LAUNCHER_AUTO_AGENT;
    pendingContext: LauncherPendingContext | null;
};

/** Full-page new-thread URL carrying the pending context as query params. */
export const buildNewThreadUrl = ({
    projectUuid,
    agent,
    pendingContext,
}: Args) => {
    const params = new URLSearchParams();
    if (pendingContext?.chartUuid) {
        params.set('chartUuid', pendingContext.chartUuid);
    }
    if (pendingContext?.dashboardUuid) {
        params.set('dashboardUuid', pendingContext.dashboardUuid);
    }
    if (pendingContext?.dataAppUuid) {
        params.set('dataAppUuid', pendingContext.dataAppUuid);
    }
    const isAuto = isLauncherAutoAgent(agent);
    if (isAuto) {
        params.set(AI_ROUTING_SEARCH_PARAM, AI_ROUTING_AUTO_VALUE);
    }
    const search = params.toString();
    const base = isAuto
        ? `/projects/${projectUuid}/ai-agents`
        : `/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`;
    return search ? `${base}?${search}` : base;
};

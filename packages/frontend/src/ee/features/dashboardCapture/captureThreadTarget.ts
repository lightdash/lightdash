import { isLauncherAutoAgent } from '../aiCopilot/components/Launcher/launcherAgentSelection';
import { type AiAgentLauncherState } from '../aiCopilot/store/aiAgentLauncherSlice';

type LauncherPanel = Pick<
    AiAgentLauncherState,
    'mode' | 'view' | 'activeThreadId' | 'activeAgentUuid'
>;

/**
 * The thread a Voice Design recording should continue: the one open in the agent
 * panel. Null means start a new thread (panel closed, or on a new chat).
 */
export const captureThreadTarget = (
    panel: LauncherPanel,
): { threadId: string; agentUuid: string } | null => {
    if (panel.mode !== 'panel-open' || panel.view !== 'chat') return null;
    if (!panel.activeThreadId || !panel.activeAgentUuid) return null;
    if (isLauncherAutoAgent(panel.activeAgentUuid)) return null;
    return {
        threadId: panel.activeThreadId,
        agentUuid: panel.activeAgentUuid,
    };
};

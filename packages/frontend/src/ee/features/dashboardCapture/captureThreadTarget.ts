import { AI_THREAD_IMAGES_MAX_PER_THREAD } from '@lightdash/common';
import { isLauncherAutoAgent } from '../aiCopilot/components/Launcher/launcherAgentSelection';
import { type AiAgentLauncherState } from '../aiCopilot/store/aiAgentLauncherSlice';

type LauncherPanel = Pick<
    AiAgentLauncherState,
    'mode' | 'view' | 'activeThreadId' | 'activeAgentUuid'
>;

/**
 * The thread an Inline recording should continue: the one open in the agent
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

/** Whether a recording's screenshots all fit in a conversation that already holds some. */
export const screenshotsFitInThread = (
    alreadyInThread: number,
    screenshots: number,
): boolean =>
    screenshots === 0 ||
    alreadyInThread + screenshots <= AI_THREAD_IMAGES_MAX_PER_THREAD;

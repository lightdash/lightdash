import {
    AI_THREAD_IMAGES_MAX_PER_PROMPT,
    AI_THREAD_IMAGES_MAX_PER_THREAD,
} from '@lightdash/common';
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

/** How many screenshots can go with this message, given how many the thread already has. */
export const imagesThatStillFit = (
    alreadyInThread: number,
    wanted: number,
): number =>
    Math.max(
        0,
        Math.min(
            wanted,
            AI_THREAD_IMAGES_MAX_PER_PROMPT,
            AI_THREAD_IMAGES_MAX_PER_THREAD - alreadyInThread,
        ),
    );

import { type AiPromptContextInput } from '@lightdash/common';
import {
    isLauncherAutoAgent,
    type LauncherSelectedAgent,
} from '../aiCopilot/components/Launcher/launcherAgentSelection';
import { type LauncherPendingContext } from '../aiCopilot/store/aiAgentLauncherSlice';

/**
 * Where a Voice Design recording goes. It picks the agent the same way the
 * agent button does, so a recording never lands on an agent the user did not
 * choose:
 * - `continue`: the conversation open in the agent panel.
 * - `create`: a new conversation with the user's default agent (or the only
 *   one the project has).
 * - `panel`: hand the message to the agent panel, which picks the agent
 *   itself (the automatic agent picker) and sends it.
 */
export type CaptureSendPlan =
    | { type: 'continue'; threadId: string; agentUuid: string }
    | { type: 'create'; agentUuid: string }
    | { type: 'panel' };

export const captureSendPlan = ({
    openThread,
    selectedAgent,
}: {
    openThread: { threadId: string; agentUuid: string } | null;
    selectedAgent: LauncherSelectedAgent;
}): CaptureSendPlan => {
    if (openThread) return { type: 'continue', ...openThread };
    if (selectedAgent && !isLauncherAutoAgent(selectedAgent)) {
        return { type: 'create', agentUuid: selectedAgent.uuid };
    }
    return { type: 'panel' };
};

/** The attached items in the shape the agent panel takes for a new chat. */
export const toPendingContext = (
    context: AiPromptContextInput,
): LauncherPendingContext | null => {
    const pending: LauncherPendingContext = {};
    for (const item of context) {
        if (item.type === 'dashboard' && !pending.dashboardUuid) {
            pending.dashboardUuid = item.dashboardUuid;
        }
        if (item.type === 'chart' && !pending.chartUuid) {
            pending.chartUuid = item.chartUuid;
        }
        if (item.type === 'data_app' && !pending.dataAppUuid) {
            pending.dataAppUuid = item.appUuid;
        }
    }
    return Object.keys(pending).length > 0 ? pending : null;
};

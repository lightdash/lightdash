import useApp from '../../../../../providers/App/useApp';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { store as aiAgentStore } from '../../store';
import { openPanel } from '../../store/aiAgentLauncherSlice';
import { getLauncherAgentUuid } from '../Launcher/launcherAgentSelection';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

type Args = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    clickedFrom: AiAgentAskClickedSource;
};

/**
 * Shared logic for the "Ask AI Agent" entry points: resolves whether the action
 * should be shown and opens the launcher panel for a new conversation on click.
 * `canAsk` is false when AI agents are disabled, the user lacks permission, or
 * no default agent can be resolved.
 */
export const useAskAiAgentAction = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    clickedFrom,
}: Args) => {
    const isVisible = useAiAgentButtonVisibility();
    const { selectedAgent } = useDefaultAiAgent(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();

    const canAsk = isVisible && !!selectedAgent;

    const handleClick = () => {
        if (!selectedAgent) return;
        track({
            name: EventName.AI_AGENT_ASK_CLICKED,
            properties: {
                userId: user?.data?.userUuid,
                organizationId: user?.data?.organizationUuid,
                projectId: projectUuid,
                clickedFrom,
            },
        });
        const pendingContext =
            chartUuid || dashboardUuid ? { chartUuid, dashboardUuid } : null;
        aiAgentStore.dispatch(
            openPanel({
                threadId: null,
                agentUuid: getLauncherAgentUuid(selectedAgent),
                pendingContext,
            }),
        );
    };

    return { canAsk, handleClick };
};

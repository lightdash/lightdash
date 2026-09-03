import { FeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { store as aiAgentStore } from '../../store';
import { openDefaultAgentPanel } from '../../store/aiAgentLauncherSlice';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

type Args = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    dataAppUuid?: string;
    clickedFrom: AiAgentAskClickedSource;
};

/**
 * Shared logic for the "Ask AI Agent" entry points: resolves whether the action
 * should be shown and opens the launcher panel for a new conversation on click.
 * `canAsk` is false when AI agents are disabled, the user lacks permission, or
 * no default agent can be resolved. Data app context additionally requires
 * data apps to be enabled.
 */
export const useAskAiAgentAction = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    dataAppUuid,
    clickedFrom,
}: Args) => {
    const isVisible = useAiAgentButtonVisibility();
    const { agents } = useDefaultAiAgent(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;

    const canAsk =
        isVisible && agents.length > 0 && (!dataAppUuid || dataAppsEnabled);

    const handleClick = () => {
        if (!canAsk) return;
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
            chartUuid || dashboardUuid || dataAppUuid
                ? { chartUuid, dashboardUuid, dataAppUuid }
                : null;
        aiAgentStore.dispatch(openDefaultAgentPanel({ pendingContext }));
    };

    return { canAsk, handleClick };
};

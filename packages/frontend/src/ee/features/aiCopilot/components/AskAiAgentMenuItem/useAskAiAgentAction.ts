import { assertUnreachable, FeatureFlags } from '@lightdash/common';
import { useNavigate } from 'react-router';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../../providers/App/useApp';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { store as aiAgentStore } from '../../store';
import { openDefaultAgentPanel } from '../../store/aiAgentLauncherSlice';
import { buildNewThreadUrl } from '../Launcher/newThreadUrl';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

/**
 * `panel` opens the docked launcher; `navigate` goes to the full-page
 * new-thread route for surfaces where the launcher is hidden (My apps).
 */
export type AskAiAgentMode = 'panel' | 'navigate';

type Args = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    dataAppUuid?: string;
    clickedFrom: AiAgentAskClickedSource;
    mode?: AskAiAgentMode;
};

/**
 * Shared logic for the "Ask AI Agent" entry points: resolves whether the action
 * should be shown and starts a new conversation on click.
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
    mode = 'panel',
}: Args) => {
    const isVisible = useAiAgentButtonVisibility();
    const { agents, selectedAgent } = useDefaultAiAgent(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();
    const navigate = useNavigate();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;

    // Navigate mode needs the resolved agent for the URL before it can act.
    const canNavigate = !!projectUuid && !!selectedAgent;
    const canAsk =
        isVisible &&
        agents.length > 0 &&
        (!dataAppUuid || dataAppsEnabled) &&
        (mode !== 'navigate' || canNavigate);

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
        switch (mode) {
            case 'panel':
                aiAgentStore.dispatch(
                    openDefaultAgentPanel({ pendingContext }),
                );
                return;
            case 'navigate':
                if (!projectUuid || !selectedAgent) return;
                void navigate(
                    buildNewThreadUrl({
                        projectUuid,
                        agent: selectedAgent,
                        pendingContext,
                    }),
                );
                return;
            default:
                return assertUnreachable(mode, 'Unknown ask AI mode');
        }
    };

    return { canAsk, handleClick };
};

import { Menu } from '@mantine-8/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useApp from '../../../../../providers/App/useApp';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { store as aiAgentStore } from '../../store';
import { openPanel } from '../../store/aiAgentLauncherSlice';
import { useDefaultAiAgent } from '../Launcher/useDefaultAiAgent';

type Props = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    clickedFrom: AiAgentAskClickedSource;
    /**
     * Render a `<Menu.Divider />` after the item. The divider is only rendered
     * when the item itself is visible, so callers don't need to gate it.
     */
    withDivider?: boolean;
};

/**
 * Menu item that opens the AI agent launcher panel for a new conversation.
 * Renders nothing when AI agents are not enabled, the user lacks permission,
 * or no default agent can be resolved.
 */
export const AskAiAgentMenuItem: FC<Props> = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    clickedFrom,
    withDivider = false,
}) => {
    const isVisible = useAiAgentButtonVisibility();
    const { agent } = useDefaultAiAgent(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();

    if (!isVisible || !agent) return null;

    const handleClick = () => {
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
                agentUuid: agent.uuid,
                pendingContext,
            }),
        );
    };

    return (
        <>
            <Menu.Item
                leftSection={<MantineIcon icon={IconMessageCircleStar} />}
                onClick={handleClick}
            >
                Ask AI Agent
            </Menu.Item>
            {withDivider && <Menu.Divider />}
        </>
    );
};

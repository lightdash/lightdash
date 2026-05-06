import { Menu } from '@mantine-8/core';
import { IconMessageCircleStar } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useApp from '../../../../../providers/App/useApp';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { useAskAiAgentUrl } from '../../hooks/useAskAiAgentUrl';

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
 * Menu item that links to the user's preferred AI agent's new-thread page,
 * with the given chart/dashboard pinned as context. Renders nothing when AI
 * agents are not enabled, the user lacks permission, or no agent is yet
 * resolved.
 */
export const AskAiAgentMenuItem: FC<Props> = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    clickedFrom,
    withDivider = false,
}) => {
    const isVisible = useAiAgentButtonVisibility();
    const url = useAskAiAgentUrl({ projectUuid, chartUuid, dashboardUuid });
    const { user } = useApp();
    const { track } = useTracking();

    if (!isVisible || !url) return null;

    return (
        <>
            <Menu.Item
                component={Link}
                to={url}
                leftSection={<MantineIcon icon={IconMessageCircleStar} />}
                onClick={() => {
                    track({
                        name: EventName.AI_AGENT_ASK_CLICKED,
                        properties: {
                            userId: user?.data?.userUuid,
                            organizationId: user?.data?.organizationUuid,
                            projectId: projectUuid,
                            clickedFrom,
                        },
                    });
                }}
            >
                Ask AI Agent
            </Menu.Item>
            {withDivider && <Menu.Divider />}
        </>
    );
};

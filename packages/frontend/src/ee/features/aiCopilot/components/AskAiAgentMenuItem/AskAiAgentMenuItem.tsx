import { Menu } from '@mantine-8/core';
import { type FC } from 'react';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import { AiAgentIcon } from '../AiAgentIcon';
import { useAskAiAgentAction } from './useAskAiAgentAction';

type Props = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    dashboardTabUuid?: string | null;
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
    dashboardTabUuid,
    clickedFrom,
    withDivider = false,
}) => {
    const { canAsk, handleClick } = useAskAiAgentAction({
        projectUuid,
        chartUuid,
        dashboardUuid,
        dashboardTabUuid,
        clickedFrom,
    });

    if (!canAsk) return null;

    return (
        <>
            <Menu.Item
                leftSection={<AiAgentIcon size={13} />}
                onClick={handleClick}
                fw={550}
            >
                Ask AI Agent
            </Menu.Item>
            {withDivider && <Menu.Divider />}
        </>
    );
};

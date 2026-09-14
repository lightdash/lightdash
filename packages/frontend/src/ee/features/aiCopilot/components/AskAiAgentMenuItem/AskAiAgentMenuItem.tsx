import { Menu } from '@mantine/core';
import { type FC } from 'react';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import { AiAgentIcon } from '../AiAgentIcon';
import {
    useAskAiAgentAction,
    type AskAiAgentMode,
} from './useAskAiAgentAction';

type Props = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    dataAppUuid?: string;
    clickedFrom: AiAgentAskClickedSource;
    mode?: AskAiAgentMode;
    /**
     * Render a `<Menu.Divider />` after the item. The divider is only rendered
     * when the item itself is visible, so callers don't need to gate it.
     */
    withDivider?: boolean;
};

/**
 * Menu item that starts a new AI agent conversation (panel or full page).
 * Renders nothing when AI agents are not enabled, the user lacks permission,
 * or no default agent can be resolved.
 */
export const AskAiAgentMenuItem: FC<Props> = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    dataAppUuid,
    clickedFrom,
    mode,
    withDivider = false,
}) => {
    const { canAsk, handleClick } = useAskAiAgentAction({
        projectUuid,
        chartUuid,
        dashboardUuid,
        dataAppUuid,
        clickedFrom,
        mode,
    });

    if (!canAsk) return null;

    return (
        <>
            <Menu.Item
                leftSection={<AiAgentIcon size={13} />}
                onClick={handleClick}
                fw={500}
            >
                Ask AI Agent
            </Menu.Item>
            {withDivider && <Menu.Divider />}
        </>
    );
};

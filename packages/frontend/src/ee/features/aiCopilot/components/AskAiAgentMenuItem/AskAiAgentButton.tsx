import { ActionIcon, type ActionIconProps, Tooltip } from '@mantine-8/core';
import { type FC } from 'react';
import { type AiAgentAskClickedSource } from '../../../../../providers/Tracking/types';
import { AiAgentIcon } from '../AiAgentIcon';
import { useAskAiAgentAction } from './useAskAiAgentAction';

type Props = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
    clickedFrom: AiAgentAskClickedSource;
    variant?: ActionIconProps['variant'];
    size?: ActionIconProps['size'];
    radius?: ActionIconProps['radius'];
    iconSize?: number;
};

/**
 * Icon button that opens the AI agent launcher panel for a new conversation.
 * Renders nothing when AI agents are not enabled, the user lacks permission,
 * or no default agent can be resolved.
 */
export const AskAiAgentButton: FC<Props> = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
    clickedFrom,
    variant = 'subtle',
    size = 'sm',
    radius,
    iconSize = 16,
}) => {
    const { canAsk, handleClick } = useAskAiAgentAction({
        projectUuid,
        chartUuid,
        dashboardUuid,
        clickedFrom,
    });

    if (!canAsk) return null;

    return (
        <Tooltip label="Ask AI Agent" variant="xs" withinPortal>
            <ActionIcon
                variant={variant}
                size={size}
                radius={radius}
                color="gray"
                onClick={handleClick}
            >
                <AiAgentIcon size={iconSize} />
            </ActionIcon>
        </Tooltip>
    );
};

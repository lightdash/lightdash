import { Badge, Tooltip } from '@mantine-8/core';
import type { FC } from 'react';

type Props = {
    tooltipLabel?: string;
};

/**
 * A badge that displays an experimental label and a tooltip when hovered.
 * Used for hackathon/early-stage features that may change significantly or be removed.
 * @param tooltipLabel - The label to display in the tooltip
 */
export const ExperimentalBadge: FC<Props> = ({
    tooltipLabel = 'This feature is experimental. It may change significantly or be removed.',
}) => {
    return (
        <Tooltip label={tooltipLabel}>
            <Badge color="red" size="xs" radius="sm" fz="xs">
                Experimental
            </Badge>
        </Tooltip>
    );
};

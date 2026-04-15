import { Badge, Tooltip } from '@mantine-8/core';
import type { FC } from 'react';

type Props = {
    tooltipLabel?: string;
};

/**
 * A badge that displays an experimental label and a tooltip when hovered.
 * @param tooltipLabel - The label to display in the tooltip
 * @returns A badge that displays an experimental label and a tooltip when hovered.
 */
export const ExperimentalBadge: FC<Props> = ({
    tooltipLabel = 'This feature is experimental. It may change or be removed without notice.',
}) => {
    return (
        <Tooltip label={tooltipLabel}>
            <Badge color="red" size="xs" radius="sm" fz="xs">
                Experimental
            </Badge>
        </Tooltip>
    );
};

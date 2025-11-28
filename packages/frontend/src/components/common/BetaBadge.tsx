import { Badge, Tooltip } from '@mantine-8/core';
import type { FC } from 'react';

type Props = {
    tooltipLabel?: string;
};

/**
 * A badge that displays a beta label and a tooltip when hovered.
 * @param tooltipLabel - The label to display in the tooltip
 * @returns A badge that displays a beta label and a tooltip when hovered.
 */
export const BetaBadge: FC<Props> = ({
    tooltipLabel = 'This feature is currently in beta. It might cause unexpected results and is subject to change.',
}) => {
    return (
        <Tooltip label={tooltipLabel}>
            <Badge color="indigo" size="xs" radius="sm" fz="xs">
                Beta
            </Badge>
        </Tooltip>
    );
};

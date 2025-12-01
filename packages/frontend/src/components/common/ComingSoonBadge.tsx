import { Badge, Tooltip } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from './MantineIcon';

type Props = {
    tooltipLabel?: string;
};

/**
 * A badge that displays a coming soon label and a tooltip when hovered.
 * @param tooltipLabel - The label to display in the tooltip
 * @returns A badge that displays a coming soon label and a tooltip when hovered.
 */
export const ComingSoonBadge: FC<Props> = ({
    tooltipLabel = 'This feature is coming soon. Contact us if you are interested!',
}) => {
    return (
        <Tooltip label={tooltipLabel}>
            <Badge
                color="indigo"
                variant="light"
                rightSection={<MantineIcon icon={IconSparkles} />}
            >
                Coming Soon
            </Badge>
        </Tooltip>
    );
};

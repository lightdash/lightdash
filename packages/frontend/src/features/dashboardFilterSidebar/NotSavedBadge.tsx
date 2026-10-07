import { Badge, Tooltip } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    tooltip?: string;
};

export const NotSavedBadge: FC<Props> = ({
    tooltip = 'Not saved. This setting resets when you reload the page.',
}) => (
    <Tooltip label={tooltip}>
        <Badge size="xs" variant="light" color="gray" radius="sm">
            Not saved
        </Badge>
    </Tooltip>
);

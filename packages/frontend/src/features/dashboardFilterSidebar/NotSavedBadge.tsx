import { Badge, Tooltip } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    tooltip?: string;
};

export const NotSavedBadge: FC<Props> = ({
    tooltip = 'This setting is not saved yet. It lasts until you reload.',
}) => (
    <Tooltip label={tooltip}>
        <Badge size="xs" variant="light" color="gray" radius="sm">
            Not saved
        </Badge>
    </Tooltip>
);

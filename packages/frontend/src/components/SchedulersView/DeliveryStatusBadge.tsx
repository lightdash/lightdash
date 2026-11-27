import { type SchedulerAndTargets } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine/core';
import {
    IconAlertTriangle,
    IconClock,
    IconPlayerPause,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = Pick<
    SchedulerAndTargets,
    'enabled' | 'automaticallyDisabledReason'
>;

const DeliveryStatusBadge: FC<Props> = ({
    enabled,
    automaticallyDisabledReason,
}) => {
    if (!enabled && automaticallyDisabledReason) {
        return (
            <Tooltip
                label={automaticallyDisabledReason}
                multiline
                maw={280}
                events={{ hover: true, focus: true, touch: true }}
            >
                <Badge
                    tabIndex={0}
                    size="sm"
                    variant="light"
                    color="orange"
                    leftSection={
                        <MantineIcon icon={IconAlertTriangle} size={12} />
                    }
                >
                    Automatically paused
                </Badge>
            </Tooltip>
        );
    }

    return (
        <Badge
            size="sm"
            variant="light"
            color={enabled ? 'teal' : 'gray'}
            leftSection={
                <MantineIcon
                    icon={enabled ? IconClock : IconPlayerPause}
                    size={12}
                />
            }
        >
            {enabled ? 'Scheduled' : 'Paused'}
        </Badge>
    );
};

export default DeliveryStatusBadge;

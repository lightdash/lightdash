import { type ResourceViewSpaceItem } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine-8/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import React, { useMemo } from 'react';
import MantineIcon from '../MantineIcon';
import { ResourceAccess } from './types';
import { getResourceAccessLabel, getResourceAccessType } from './utils';

const ResourceAccessInfoData = {
    [ResourceAccess.Private]: {
        Icon: IconLock,
        status: 'Private',
    },
    [ResourceAccess.Public]: {
        Icon: IconUsers,
        status: 'Public',
    },
    [ResourceAccess.Shared]: {
        Icon: IconUser,
        status: 'Shared',
    },
} as const;

interface ResourceAccessInfoProps {
    item: ResourceViewSpaceItem;
    type?: 'primary' | 'secondary';
    withTooltip?: boolean;
}

const ResourceAccessInfo: React.FC<ResourceAccessInfoProps> = ({
    item,
    type = 'secondary',
    withTooltip = false,
}) => {
    const { Icon, status } =
        ResourceAccessInfoData[getResourceAccessType(item)];

    const styles = useMemo(() => {
        return {
            color: type === 'primary' ? 'ldGray.7' : 'ldGray.6',
            size: type === 'primary' ? 14 : 12,
        };
    }, [type]);

    return (
        <Tooltip
            withinPortal
            withArrow
            position="top"
            // Hack the tooltip to never open when `withTooltip` is false
            opened={withTooltip ? undefined : false}
            label={
                <Text lineClamp={1} fz="xs" fw={600} c="white">
                    {getResourceAccessLabel(item)}
                </Text>
            }
        >
            <Group gap={4}>
                <MantineIcon
                    icon={Icon}
                    color={styles.color}
                    size={styles.size}
                />

                <Text fz={styles.size} c={styles.color}>
                    {status}
                </Text>
            </Group>
        </Tooltip>
    );
};

export default ResourceAccessInfo;

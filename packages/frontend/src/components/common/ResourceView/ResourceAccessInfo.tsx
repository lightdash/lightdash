import { type ResourceViewSpaceItem } from '@lightdash/common';
import { Group, Text, useMantineTheme } from '@mantine/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import React, { useMemo } from 'react';
import { ResourceAccess } from './types';
import { getResourceAccessType } from './utils';

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
}

const ResourceAccessInfo: React.FC<ResourceAccessInfoProps> = ({
    item,
    type = 'secondary',
}) => {
    const { Icon, status } =
        ResourceAccessInfoData[getResourceAccessType(item)];

    const theme = useMantineTheme();

    const styles = useMemo(() => {
        return {
            color:
                type === 'primary'
                    ? theme.colors.gray[7]
                    : theme.colors.gray[6],
            size: type === 'primary' ? 14 : 12,
        };
    }, [theme, type]);

    return (
        <Group spacing={4}>
            <Icon color={styles.color} size={styles.size} />

            <Text size={styles.size} color={styles.color}>
                {status}
            </Text>
        </Group>
    );
};

export default ResourceAccessInfo;

import { type ResourceViewSpaceItem } from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import React, { useMemo } from 'react';
import MantineIcon from '../MantineIcon';
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

    const styles = useMemo(() => {
        return {
            color: type === 'primary' ? 'gray.7' : 'gray.6',
            size: type === 'primary' ? 14 : 12,
        };
    }, [type]);

    return (
        <Group spacing={4}>
            <MantineIcon icon={Icon} color={styles.color} size={styles.size} />

            <Text size={styles.size} color={styles.color}>
                {status}
            </Text>
        </Group>
    );
};

export default ResourceAccessInfo;

import { type ResourceViewSpaceItem } from '@lightdash/common';
import { Text, useMantineTheme } from '@mantine/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import React from 'react';
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
}

const ResourceAccessInfo: React.FC<ResourceAccessInfoProps> = ({ item }) => {
    const { Icon, status } =
        ResourceAccessInfoData[getResourceAccessType(item)];

    const theme = useMantineTheme();

    return (
        <>
            <Icon color={theme.colors.gray[6]} size={14} />

            <Text size={14} color="gray.6" fz="xs">
                {status}
            </Text>
        </>
    );
};

export default ResourceAccessInfo;

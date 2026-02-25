import { FeatureFlags, type ResourceViewSpaceItem } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine-8/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import React, { useMemo } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
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

const getV2AccessType = (item: ResourceViewSpaceItem): ResourceAccess => {
    if (item.data.inheritParentPermissions) {
        return ResourceAccess.Public;
    }
    if (item.data.access.length > 1) {
        return ResourceAccess.Shared;
    }
    return ResourceAccess.Private;
};

const getV2Status = (
    accessType: ResourceAccess,
    isNestedSpace: boolean,
): string => {
    switch (accessType) {
        case ResourceAccess.Public:
            return isNestedSpace ? 'Parent Access' : 'Project Access';
        case ResourceAccess.Private:
            return 'Private';
        case ResourceAccess.Shared:
            return 'Custom Access';
    }
};

const getV2Label = (
    item: ResourceViewSpaceItem,
    accessType: ResourceAccess,
    isNestedSpace: boolean,
): string => {
    switch (accessType) {
        case ResourceAccess.Public:
            return isNestedSpace
                ? 'Inherits access from the parent space'
                : 'All project members can access';
        case ResourceAccess.Private:
            return 'Only you and admins can access';
        case ResourceAccess.Shared:
            return `Shared with ${item.data.accessListLength} member${
                item.data.accessListLength > 1 ? 's' : ''
            }`;
    }
};

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
    const { data: nestedSpacesPermissionsFlag } = useServerFeatureFlag(
        FeatureFlags.NestedSpacesPermissions,
    );
    const isV2 = !!nestedSpacesPermissionsFlag?.enabled;

    const accessType = isV2
        ? getV2AccessType(item)
        : getResourceAccessType(item);
    const isNestedSpace = !!item.data.parentSpaceUuid;
    const { Icon } = ResourceAccessInfoData[accessType];
    const status = isV2
        ? getV2Status(accessType, isNestedSpace)
        : ResourceAccessInfoData[accessType].status;
    const tooltipLabel = isV2
        ? getV2Label(item, accessType, isNestedSpace)
        : getResourceAccessLabel(item);

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
                    {tooltipLabel}
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

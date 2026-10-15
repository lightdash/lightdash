import { type ResourceViewSpaceItem } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine/core';
import { IconLock, IconUser, IconUsers } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../MantineIcon';
import { ResourceAccess } from './types';

const ResourceAccessInfoData = {
    [ResourceAccess.Private]: {
        Icon: IconLock,
        statusKey: 'accessInfo.status.private',
    },
    [ResourceAccess.Public]: {
        Icon: IconUsers,
        statusKey: 'accessInfo.status.inherited',
    },
    [ResourceAccess.Shared]: {
        Icon: IconUser,
        statusKey: 'accessInfo.status.restricted',
    },
} as const;

const getAccessType = (item: ResourceViewSpaceItem): ResourceAccess => {
    if (item.data.inheritParentPermissions) {
        return ResourceAccess.Public;
    }
    if (item.data.access.length > 1) {
        return ResourceAccess.Shared;
    }
    return ResourceAccess.Private;
};

const getAccessLabel = (
    t: TFunction<'resourceView'>,
    item: ResourceViewSpaceItem,
    accessType: ResourceAccess,
    isNestedSpace: boolean,
): string => {
    switch (accessType) {
        case ResourceAccess.Public:
            return isNestedSpace
                ? t('accessInfo.tooltip.inheritsFromParent')
                : t('accessInfo.tooltip.allProjectMembers');
        case ResourceAccess.Private:
            return t('accessInfo.tooltip.onlyYouAndAdmins');
        case ResourceAccess.Shared:
            return t('accessInfo.tooltip.sharedWithMembers', {
                count: item.data.accessListLength,
            });
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
    const { t } = useTranslation('resourceView');
    const accessType = getAccessType(item);
    const isNestedSpace = !!item.data.parentSpaceUuid;
    const { Icon } = ResourceAccessInfoData[accessType];
    const status = t(ResourceAccessInfoData[accessType].statusKey);
    const tooltipLabel = getAccessLabel(t, item, accessType, isNestedSpace);

    const styles = useMemo(() => {
        return {
            color: type === 'primary' ? 'ldGray.7' : 'ldGray.6',
            size: type === 'primary' ? 14 : 12,
        };
    }, [type]);

    return (
        <Tooltip
            position="top"
            // Hack the tooltip to never open when `withTooltip` is false
            opened={withTooltip ? undefined : false}
            label={
                <Text lineClamp={1} fz="xs" fw={600} c="inherit">
                    {tooltipLabel}
                </Text>
            }
        >
            <Group gap={4} w="fit-content">
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

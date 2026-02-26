import { FeatureFlags, type ResourceViewSpaceItem } from '@lightdash/common';
import { Box, Flex, Group, Paper, Stack, Text, Tooltip } from '@mantine-8/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconChartBar,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { ResourceIcon } from '../../ResourceIcon';
import AccessInfo from '../ResourceAccessInfo';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import AttributeCount from '../ResourceAttributeCount';
import { getResourceAccessLabel } from '../utils';
import classes from './ResourceViewGridSpaceItem.module.css';

interface ResourceViewGridSpaceItemProps extends Pick<
    ResourceViewActionMenuCommonProps,
    'onAction'
> {
    item: ResourceViewSpaceItem;
    dragIcon: ReactNode;
    allowDelete?: boolean;
}

const ResourceViewGridSpaceItem: FC<ResourceViewGridSpaceItemProps> = ({
    item,
    onAction,
    dragIcon,
    allowDelete,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);
    const { data: nestedSpacesPermissionsFlag } = useServerFeatureFlag(
        FeatureFlags.NestedSpacesPermissions,
    );
    const isV2 = !!nestedSpacesPermissionsFlag?.enabled;

    const tooltipText = useMemo(() => {
        return getResourceAccessLabel(item);
    }, [item]);

    return (
        <Paper
            ref={ref}
            pos="relative"
            p={0}
            withBorder
            className={classes.gridCard}
            h="100%"
        >
            <Group p="md" align="center" gap="md" wrap="nowrap">
                {dragIcon}
                <ResourceIcon item={item} />

                <Tooltip
                    position="top"
                    withArrow
                    label={
                        <Stack gap={4}>
                            <Text lineClamp={1} fz="xs" fw={600}>
                                {tooltipText}
                            </Text>
                            <Group>
                                <AttributeCount
                                    Icon={IconLayoutDashboard}
                                    count={item.data.dashboardCount}
                                />
                                <AttributeCount
                                    Icon={IconChartBar}
                                    count={item.data.chartCount}
                                />
                                <AttributeCount
                                    Icon={IconFolder}
                                    count={item.data.childSpaceCount}
                                />
                            </Group>
                        </Stack>
                    }
                >
                    <Stack gap={4} className={classes.spaceContentStack}>
                        <Text
                            lineClamp={1}
                            fz="sm"
                            fw={600}
                            className={classes.spaceName}
                        >
                            {item.data.name}
                        </Text>

                        <Group gap="sm">
                            {isV2 ? (
                                <>
                                    <AttributeCount
                                        Icon={IconLayoutDashboard}
                                        count={item.data.dashboardCount}
                                    />
                                    <AttributeCount
                                        Icon={IconChartBar}
                                        count={item.data.chartCount}
                                    />
                                    <AttributeCount
                                        Icon={IconFolder}
                                        count={item.data.childSpaceCount}
                                    />
                                </>
                            ) : (
                                <Flex align="center" gap={4}>
                                    <AccessInfo item={item} />
                                </Flex>
                            )}
                        </Group>
                    </Stack>
                </Tooltip>
                <Flex
                    align="center"
                    gap={4}
                    className={classes.spaceActionBox}
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    <Box display={hovered || opened ? 'block' : 'none'}>
                        <ResourceViewActionMenu
                            item={item}
                            allowDelete={allowDelete}
                            isOpen={opened}
                            onOpen={handlers.open}
                            onClose={handlers.close}
                            onAction={onAction}
                        />
                    </Box>
                </Flex>
            </Group>
        </Paper>
    );
};

export default ResourceViewGridSpaceItem;

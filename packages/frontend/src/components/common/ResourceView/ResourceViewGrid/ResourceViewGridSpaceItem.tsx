import {
    assertUnreachable,
    type ResourceViewSpaceItem,
} from '@lightdash/common';
import {
    Box,
    Flex,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconLock,
    IconUser,
    IconUsers,
    type Icon as IconType,
} from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';

import { ResourceIcon } from '../../ResourceIcon';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';

interface ResourceViewGridSpaceItemProps
    extends Pick<ResourceViewActionMenuCommonProps, 'onAction'> {
    item: ResourceViewSpaceItem;
    dragIcon: ReactNode;
    allowDelete?: boolean;
}

enum ResourceAccess {
    Private = 'private',
    Public = 'public',
    Shared = 'shared',
}

const getResourceAccessType = (item: ResourceViewSpaceItem): ResourceAccess => {
    if (!item.data.isPrivate) {
        return ResourceAccess.Public;
    } else if (item.data.accessListLength > 1) {
        return ResourceAccess.Shared;
    } else {
        return ResourceAccess.Private;
    }
};

const AccessInfoData = {
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

interface AccessInfoProps {
    item: ResourceViewSpaceItem;
}

const AccessInfo: FC<AccessInfoProps> = ({ item }) => {
    const { Icon, status } = AccessInfoData[getResourceAccessType(item)];

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

const AttributeCount: FC<{ Icon: IconType; count: number }> = ({
    Icon,
    count,
}) => {
    const theme = useMantineTheme();
    return (
        <Flex align="center" gap={4}>
            <Icon color={theme.colors.gray[6]} size={14} />

            <Text size={14} color="gray.6" fz="xs">
                {count}
            </Text>
        </Flex>
    );
};

const ResourceViewGridSpaceItem: FC<ResourceViewGridSpaceItemProps> = ({
    item,
    onAction,
    dragIcon,
    allowDelete,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);

    const theme = useMantineTheme();

    const tooltipText = useMemo(() => {
        const accessType = getResourceAccessType(item);

        switch (accessType) {
            case ResourceAccess.Private:
                return 'Only visible to you';
            case ResourceAccess.Public:
                return 'Everyone in this project has access';
            case ResourceAccess.Shared:
                return `Shared with ${item.data.accessListLength} user${
                    item.data.accessListLength > 1 ? 's' : ''
                }`;
            default:
                return assertUnreachable(
                    accessType,
                    `Unknown access type ${accessType}`,
                );
        }
    }, [item]);

    return (
        <Paper
            ref={ref}
            pos="relative"
            p={0}
            withBorder
            bg={hovered ? theme.fn.rgba(theme.colors.gray[0], 0.5) : undefined}
            h="100%"
        >
            <Group p="md" align="center" spacing="md" noWrap>
                {dragIcon}
                <ResourceIcon item={item} />

                <Tooltip
                    position="top"
                    withArrow
                    label={
                        <Stack spacing={4}>
                            <Text lineClamp={1} fz="xs" fw={600} color="white">
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
                            </Group>
                        </Stack>
                    }
                >
                    <Stack spacing={4} sx={{ flexGrow: 1, flexShrink: 1 }}>
                        <Text
                            lineClamp={1}
                            fz="sm"
                            fw={600}
                            sx={{ overflowWrap: 'anywhere' }}
                        >
                            {item.data.name}
                        </Text>

                        <Group spacing="sm">
                            <Flex align="center" gap={4}>
                                <AccessInfo item={item} />
                            </Flex>
                        </Group>
                    </Stack>
                </Tooltip>
                <Box
                    sx={{
                        flexGrow: 0,
                        flexShrink: 0,
                        // FIXME: change logic to use position absolute
                        // transition: 'opacity 0.2s',
                        // opacity: hovered || opened ? 1 : 0,
                        display: hovered || opened ? 'block' : 'none',
                    }}
                    component="div"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    <ResourceViewActionMenu
                        item={item}
                        allowDelete={allowDelete}
                        isOpen={opened}
                        onOpen={handlers.open}
                        onClose={handlers.close}
                        onAction={onAction}
                    />
                </Box>
            </Group>
        </Paper>
    );
};

export default ResourceViewGridSpaceItem;

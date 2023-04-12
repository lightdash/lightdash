import { assertUnreachable, ResourceViewSpaceItem } from '@lightdash/common';
import {
    Box,
    Flex,
    Group,
    Overlay,
    Paper,
    Popover,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    Icon as IconType,
    IconChartBar,
    IconLayoutDashboard,
    IconLock,
    IconUser,
    IconUsers,
} from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import ResourceViewActionMenu, {
    ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import { ResourceIcon } from '../ResourceIcon';

interface ResourceViewGridSpaceItemProps
    extends Pick<ResourceViewActionMenuCommonProps, 'onAction'> {
    item: ResourceViewSpaceItem;
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
        <Popover
            position="top"
            opened={hovered || opened}
            withArrow
            styles={{
                dropdown: { backgroundColor: theme.colors.dark[6] },
                arrow: { backgroundColor: theme.colors.dark[6] },
            }}
        >
            <Popover.Target>
                <Paper
                    ref={ref}
                    p={0}
                    withBorder
                    bg={
                        hovered
                            ? theme.fn.rgba(theme.colors.gray[0], 0.5)
                            : undefined
                    }
                    h="100%"
                >
                    <Group p="md" align="center" spacing="md" noWrap>
                        <ResourceIcon item={item} />

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
                                isOpen={opened}
                                onOpen={handlers.open}
                                onClose={handlers.close}
                                onAction={onAction}
                            />
                        </Box>
                    </Group>
                </Paper>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack spacing={4}>
                    <Text lineClamp={1} fz="sm" fw={600} color="white">
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
            </Popover.Dropdown>
        </Popover>
    );
};

export default ResourceViewGridSpaceItem;

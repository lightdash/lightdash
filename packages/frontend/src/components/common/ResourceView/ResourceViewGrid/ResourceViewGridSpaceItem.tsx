import {
    Box,
    Flex,
    Group,
    Paper,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconLock,
    IconUser,
    IconUsers,
} from '@tabler/icons-react';
import { FC } from 'react';
import ResourceViewActionMenu, {
    ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewSpaceItem } from '../resourceTypeUtils';

interface ResourceViewGridSpaceItemProps
    extends Pick<ResourceViewActionMenuCommonProps, 'onAction'> {
    item: ResourceViewSpaceItem;
}

const ResourceViewGridSpaceItem: FC<ResourceViewGridSpaceItemProps> = ({
    item,
    onAction,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);

    const theme = useMantineTheme();

    return (
        <Paper
            ref={ref}
            p={0}
            withBorder
            bg={hovered ? theme.fn.rgba(theme.colors.gray[0], 0.5) : undefined}
            h="100%"
        >
            <Group p="md" align="center" spacing="md" noWrap>
                <ResourceIcon item={item} />

                <Stack spacing={4} sx={{ flexGrow: 1, flexShrink: 1 }}>
                    <Text lineClamp={1} fz="sm" fw={600}>
                        {item.data.name}
                    </Text>

                    <Group spacing="sm">
                        <Flex align="center" gap={4}>
                            {!item.data.isPrivate ? (
                                <>
                                    <IconUsers
                                        color={theme.colors.gray[6]}
                                        size={14}
                                    />

                                    <Text size={14} color="gray.6" fz="xs">
                                        Public
                                    </Text>
                                </>
                            ) : item.data.access.length > 1 ? (
                                <>
                                    <IconUser
                                        color={theme.colors.gray[6]}
                                        size={14}
                                    />

                                    <Text size={14} color="gray.6" fz="xs">
                                        Shared
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <IconLock
                                        color={theme.colors.gray[6]}
                                        size={14}
                                    />

                                    <Text size={14} color="gray.6" fz="xs">
                                        Private
                                    </Text>
                                </>
                            )}
                        </Flex>

                        <Flex align="center" gap={4}>
                            <IconLayoutDashboard
                                color={theme.colors.gray[6]}
                                size={14}
                            />

                            <Text size={14} color="gray.6" fz="xs">
                                {item.data.dashboards.length}
                            </Text>
                        </Flex>

                        <Flex align="center" gap={4}>
                            <IconChartBar
                                color={theme.colors.gray[6]}
                                size={14}
                            />

                            <Text size={14} color="gray.6" fz="xs">
                                {item.data.queries.length}
                            </Text>
                        </Flex>
                    </Group>
                </Stack>

                <Box
                    sx={{
                        flexGrow: 0,
                        flexShrink: 0,
                        transition: 'opacity 0.2s',
                        opacity: hovered || opened ? 1 : 0,
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
    );
};

export default ResourceViewGridSpaceItem;

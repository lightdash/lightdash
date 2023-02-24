import {
    Box,
    Flex,
    Group,
    Paper,
    Stack,
    Text,
    Transition,
    useMantineTheme,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconLock,
    IconUser,
    IconUsers,
} from '@tabler/icons-react';
import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewSpaceItem } from '../resourceTypeUtils';

interface ResourceViewGridSpaceItemProps {
    item: ResourceViewSpaceItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewGridSpaceItem: FC<ResourceViewGridSpaceItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    const { hovered, ref } = useHover();
    const theme = useMantineTheme();

    return (
        <Paper ref={ref} p={0} withBorder>
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

                <Transition
                    mounted={hovered}
                    transition="fade"
                    duration={200}
                    timingFunction="ease"
                >
                    {(styles) => (
                        <Box sx={{ flexGrow: 0, flexShrink: 0 }} style={styles}>
                            {renderActions()}
                        </Box>
                    )}
                </Transition>
            </Group>
        </Paper>
    );
};

export default ResourceViewGridSpaceItem;

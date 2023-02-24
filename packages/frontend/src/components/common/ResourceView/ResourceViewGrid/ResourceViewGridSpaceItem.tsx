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
                <Box sx={{ flexGrow: 0, flexShrink: 0 }}>
                    <ResourceIcon item={item} />
                </Box>

                <Stack spacing={4} sx={{ flexGrow: 1, flexShrink: 1 }}>
                    <Text lineClamp={1} fz="sm" fw={600}>
                        {item.data.name}
                    </Text>

                    <Group spacing="sm">
                        <Flex align="center" gap={4}>
                            {/* Private, restricted, only visible to you? */}
                            {item.data.isPrivate ? (
                                <IconLock
                                    color={theme.colors.gray[6]}
                                    size={14}
                                />
                            ) : (
                                <IconUsers
                                    color={theme.colors.gray[6]}
                                    size={14}
                                />
                            )}

                            <Text size={14} color="gray.6" fz="xs">
                                {item.data.isPrivate ? 'Private' : 'Restricted'}
                            </Text>
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

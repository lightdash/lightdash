import { Colors } from '@blueprintjs/core';
import { Box, Flex, Group, Paper, Stack, Text } from '@mantine/core';
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
    return (
        <Paper p={0} withBorder>
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
                                <IconLock color={Colors.GRAY2} size={14} />
                            ) : (
                                <IconUsers color={Colors.GRAY2} size={14} />
                            )}

                            <Text size={14} color="gray.6" fz="xs">
                                {item.data.isPrivate ? 'Private' : 'Restricted'}
                            </Text>
                        </Flex>

                        <Flex align="center" gap={4}>
                            <IconLayoutDashboard
                                color={Colors.GRAY2}
                                size={14}
                            />

                            <Text size={14} color="gray.6" fz="xs">
                                {item.data.dashboards.length}
                            </Text>
                        </Flex>

                        <Flex align="center" gap={4}>
                            <IconChartBar color={Colors.GRAY2} size={14} />

                            <Text size={14} color="gray.6" fz="xs">
                                {item.data.queries.length}
                            </Text>
                        </Flex>
                    </Group>
                </Stack>

                <Box sx={{ flexGrow: 0, flexShrink: 0 }}>{renderActions()}</Box>
            </Group>
        </Paper>
    );
};

export default ResourceViewGridSpaceItem;

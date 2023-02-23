import { Box, Divider, Flex, Group, Paper, Text } from '@mantine/core';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';
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
            <Group p="md" align="center" spacing="xs" noWrap>
                <Box>
                    <ResourceIcon item={item} />
                </Box>

                <Text lineClamp={2} fz="sm" fw={600}>
                    {item.data.name}
                </Text>
            </Group>

            <Divider color="gray.3" />

            <Flex pl="md" pr="xs" py={4} justify="space-between" align="center">
                <Group spacing="sm">
                    <Flex align="center" gap={2}>
                        <IconLayoutDashboard size={14} />

                        <Text size={14}>{item.data.dashboards.length}</Text>
                    </Flex>

                    <Flex align="center" gap={2}>
                        <IconChartBar size={14} />

                        <Text size={14}>{item.data.queries.length}</Text>
                    </Flex>
                </Group>

                <Box>{renderActions()}</Box>
            </Flex>
        </Paper>
    );
};

export default ResourceViewGridSpaceItem;

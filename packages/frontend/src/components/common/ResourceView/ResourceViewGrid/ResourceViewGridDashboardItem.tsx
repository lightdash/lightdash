import { Box, Divider, Flex, Group, Paper, Text } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewDashboardItem } from '../resourceTypeUtils';

interface ResourceViewGridDashboardItemProps {
    item: ResourceViewDashboardItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewGridDashboardItem: FC<ResourceViewGridDashboardItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    return (
        <Paper p={0} withBorder>
            <Group p="md" align="center" spacing="xs" noWrap grow>
                <Box>
                    <ResourceIcon item={item} />
                </Box>
                <Text lineClamp={2} fz="sm" fw={600}>
                    {item.data.name}
                </Text>
            </Group>

            <Divider color="gray.3" />

            <Flex pl="md" pr="xs" py={4} justify="space-between" align="center">
                <Flex align="center" gap={2}>
                    <IconEye size={14} />
                    <Text size={14}>{item.data.views} views</Text>
                </Flex>
                <Box>{renderActions()}</Box>
            </Flex>
        </Paper>
    );
};

export default ResourceViewGridDashboardItem;

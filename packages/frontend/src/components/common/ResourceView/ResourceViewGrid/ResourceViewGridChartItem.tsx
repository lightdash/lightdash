import { Colors } from '@blueprintjs/core';
import { Box, Divider, Flex, Group, Paper, Text } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewChartItem } from '../resourceTypeUtils';

interface ResourceViewGridChartItemProps {
    item: ResourceViewChartItem;
    url: string;
    renderActions: () => JSX.Element;
}

const ResourceViewGridChartItem: FC<ResourceViewGridChartItemProps> = ({
    item,
    url,
    renderActions,
}) => {
    return (
        <Paper component={Flex} direction="column" p={0} withBorder>
            <Group
                p="md"
                align="center"
                spacing="md"
                noWrap
                sx={{ flexGrow: 1 }}
            >
                <Box sx={{ flexShrink: 0 }}>
                    <ResourceIcon item={item} />
                </Box>

                <Text lineClamp={2} fz="sm" fw={600}>
                    {item.data.name}
                </Text>
            </Group>

            <Divider color="gray.3" />

            <Flex pl="md" pr="xs" py={2} justify="space-between" align="center">
                <Flex align="center" gap={4}>
                    <IconEye color={Colors.GRAY2} size={14} />

                    <Text size={14} color="gray.6" fz="xs">
                        {item.data.views} views
                    </Text>
                </Flex>

                <Box>{renderActions()}</Box>
            </Flex>
        </Paper>
    );
};

export default ResourceViewGridChartItem;

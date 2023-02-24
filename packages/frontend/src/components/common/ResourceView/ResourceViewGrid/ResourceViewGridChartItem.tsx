import { Colors } from '@blueprintjs/core';
import {
    Box,
    Divider,
    Flex,
    Group,
    Paper,
    Text,
    Transition,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
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
    const { hovered, ref } = useHover();

    return (
        <Paper component={Flex} direction="column" p={0} withBorder ref={ref}>
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

            <Flex pl="md" pr="xs" h={32} justify="space-between" align="center">
                <Flex align="center" gap={4}>
                    <IconEye color={Colors.GRAY2} size={14} />

                    <Text size={14} color="gray.6" fz="xs">
                        {item.data.views} views
                    </Text>
                </Flex>

                <Transition
                    mounted={hovered}
                    transition="fade"
                    duration={200}
                    timingFunction="ease"
                >
                    {(styles) => <Box style={styles}>{renderActions()}</Box>}
                </Transition>
            </Flex>
        </Paper>
    );
};

export default ResourceViewGridChartItem;

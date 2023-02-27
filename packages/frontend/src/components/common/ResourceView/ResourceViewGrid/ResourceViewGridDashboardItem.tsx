import {
    Box,
    Divider,
    Flex,
    Group,
    Paper,
    Text,
    Transition,
    useMantineTheme,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { FC } from 'react';
import ResourceIcon from '../ResourceIcon';
import { ResourceViewDashboardItem } from '../resourceTypeUtils';

interface ResourceViewGridDashboardItemProps {
    item: ResourceViewDashboardItem;
    renderActions: () => JSX.Element;
}

const ResourceViewGridDashboardItem: FC<ResourceViewGridDashboardItemProps> = ({
    item,
    renderActions,
}) => {
    const { hovered, ref } = useHover();
    const theme = useMantineTheme();

    return (
        <Paper
            ref={ref}
            component={Flex}
            direction="column"
            p={0}
            withBorder
            bg={hovered ? 'gray.0' : undefined}
            h="100%"
        >
            <Group
                p="md"
                align="center"
                spacing="md"
                noWrap
                sx={{ flexGrow: 1 }}
            >
                <ResourceIcon item={item} />

                <Text lineClamp={2} fz="sm" fw={600}>
                    {item.data.name}
                </Text>
            </Group>

            <Divider color="gray.3" />

            <Flex pl="md" pr="xs" h={32} justify="space-between" align="center">
                <Flex align="center" gap={4}>
                    <IconEye color={theme.colors.gray[6]} size={14} />

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

export default ResourceViewGridDashboardItem;

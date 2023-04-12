import { ResourceViewDashboardItem } from '@lightdash/common';
import {
    Box,
    Flex,
    Group,
    Paper,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { FC } from 'react';
import ResourceViewActionMenu, {
    ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import { ResourceIcon } from '../ResourceIcon';
import { getResourceViewsSinceWhenDescription } from '../resourceUtils';

interface ResourceViewGridDashboardItemProps
    extends Pick<ResourceViewActionMenuCommonProps, 'onAction'> {
    item: ResourceViewDashboardItem;
}

const ResourceViewGridDashboardItem: FC<ResourceViewGridDashboardItemProps> = ({
    item,
    onAction,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);
    const theme = useMantineTheme();

    return (
        <Paper
            ref={ref}
            component={Flex}
            direction="column"
            p={0}
            withBorder
            bg={hovered ? theme.fn.rgba(theme.colors.gray[0], 0.5) : undefined}
            h="100%"
        >
            <Tooltip
                label={item.data.description}
                withArrow
                position="top"
                disabled={!item.data.description}
            >
                <Group
                    p="md"
                    align="center"
                    spacing="md"
                    noWrap
                    sx={{
                        flexGrow: 1,
                        borderBottomWidth: 1,
                        borderBottomStyle: 'solid',
                        borderBottomColor: theme.colors.gray[3],
                    }}
                >
                    <ResourceIcon item={item} />

                    <Text lineClamp={2} fz="sm" fw={600}>
                        {item.data.name}
                    </Text>
                </Group>
            </Tooltip>

            <Flex pl="md" pr="xs" h={32} justify="space-between" align="center">
                <Tooltip
                    withArrow
                    position="bottom-start"
                    disabled={!item.data.views || !item.data.firstViewedAt}
                    label={getResourceViewsSinceWhenDescription(item)}
                >
                    <Flex align="center" gap={4}>
                        <IconEye color={theme.colors.gray[6]} size={14} />

                        <Text size={14} color="gray.6" fz="xs">
                            {item.data.views} views
                        </Text>
                    </Flex>
                </Tooltip>

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
            </Flex>
        </Paper>
    );
};

export default ResourceViewGridDashboardItem;

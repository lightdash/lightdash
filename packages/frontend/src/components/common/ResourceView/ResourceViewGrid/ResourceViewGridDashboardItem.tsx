import { type ResourceViewDashboardItem } from '@lightdash/common';
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
import { type FC, type ReactNode } from 'react';
import { ResourceIcon } from '../../ResourceIcon';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import { getResourceViewsSinceWhenDescription } from '../resourceUtils';

interface ResourceViewGridDashboardItemProps
    extends Pick<ResourceViewActionMenuCommonProps, 'onAction'> {
    item: ResourceViewDashboardItem;
    allowDelete?: boolean;
    dragIcon: ReactNode;
}

const ResourceViewGridDashboardItem: FC<ResourceViewGridDashboardItemProps> = ({
    item,
    allowDelete,
    onAction,
    dragIcon,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);
    const theme = useMantineTheme();

    return (
        <Paper
            ref={ref}
            component={Flex}
            pos="relative"
            direction="column"
            p={0}
            withBorder
            bg={hovered ? theme.fn.rgba(theme.colors.gray[0], 0.5) : undefined}
            h="100%"
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
                {dragIcon}
                <ResourceIcon item={item} />
                <Tooltip
                    position="top"
                    label={item.data.description}
                    disabled={!item.data.description}
                >
                    <Text lineClamp={2} fz="sm" fw={600}>
                        {item.data.name}
                    </Text>
                </Tooltip>
            </Group>

            <Flex pl="md" pr="xs" h={32} justify="space-between" align="center">
                <Tooltip
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
                        allowDelete={allowDelete}
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

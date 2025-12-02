import { type ResourceViewSpaceItem } from '@lightdash/common';
import {
    Box,
    Flex,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconChartBar, IconLayoutDashboard } from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';

import { ResourceIcon } from '../../ResourceIcon';
import AccessInfo from '../ResourceAccessInfo';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import AttributeCount from '../ResourceAttributeCount';
import { getResourceAccessLabel } from '../utils';

interface ResourceViewGridSpaceItemProps
    extends Pick<ResourceViewActionMenuCommonProps, 'onAction'> {
    item: ResourceViewSpaceItem;
    dragIcon: ReactNode;
    allowDelete?: boolean;
}

const ResourceViewGridSpaceItem: FC<ResourceViewGridSpaceItemProps> = ({
    item,
    onAction,
    dragIcon,
    allowDelete,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);

    const theme = useMantineTheme();

    const tooltipText = useMemo(() => {
        return getResourceAccessLabel(item);
    }, [item]);

    return (
        <Paper
            ref={ref}
            pos="relative"
            p={0}
            withBorder
            bg={
                hovered ? theme.fn.rgba(theme.colors.ldGray[0], 0.5) : undefined
            }
            h="100%"
        >
            <Group p="md" align="center" spacing="md" noWrap>
                {dragIcon}
                <ResourceIcon item={item} />

                <Tooltip
                    position="top"
                    withArrow
                    label={
                        <Stack spacing={4}>
                            <Text lineClamp={1} fz="xs" fw={600}>
                                {tooltipText}
                            </Text>
                            <Group>
                                <AttributeCount
                                    Icon={IconLayoutDashboard}
                                    count={item.data.dashboardCount}
                                />
                                <AttributeCount
                                    Icon={IconChartBar}
                                    count={item.data.chartCount}
                                />
                            </Group>
                        </Stack>
                    }
                >
                    <Stack spacing={4} sx={{ flexGrow: 1, flexShrink: 1 }}>
                        <Text
                            lineClamp={1}
                            fz="sm"
                            fw={600}
                            sx={{ overflowWrap: 'anywhere' }}
                        >
                            {item.data.name}
                        </Text>

                        <Group spacing="sm">
                            <Flex align="center" gap={4}>
                                <AccessInfo item={item} />
                            </Flex>
                        </Group>
                    </Stack>
                </Tooltip>
                <Box
                    sx={{
                        flexGrow: 0,
                        flexShrink: 0,
                        // FIXME: change logic to use position absolute
                        // transition: 'opacity 0.2s',
                        // opacity: hovered || opened ? 1 : 0,
                        display: hovered || opened ? 'block' : 'none',
                    }}
                    component="div"
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
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
            </Group>
        </Paper>
    );
};

export default ResourceViewGridSpaceItem;

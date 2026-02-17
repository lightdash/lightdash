import { type ResourceViewChartItem } from '@lightdash/common';
import { Box, Flex, Group, Paper, Text, Tooltip } from '@mantine-8/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import classes from './ResourceViewGridItem.module.css';
import { IconEye } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { ResourceIcon } from '../../ResourceIcon';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import { getResourceViewsSinceWhenDescription } from '../resourceUtils';

interface ResourceViewGridChartItemProps extends Pick<
    ResourceViewActionMenuCommonProps,
    'onAction'
> {
    item: ResourceViewChartItem;
    allowDelete?: boolean;
    dragIcon: ReactNode;
}

const ResourceViewGridChartItem: FC<ResourceViewGridChartItemProps> = ({
    item,
    allowDelete,
    onAction,
    dragIcon,
}) => {
    const { hovered, ref } = useHover();
    const [opened, handlers] = useDisclosure(false);

    return (
        <Paper
            ref={ref}
            pos="relative"
            p={0}
            withBorder
            className={classes.gridCard}
            h="100%"
        >
            <Group
                p="md"
                align="center"
                gap="md"
                wrap="nowrap"
                className={classes.gridCardTopSection}
            >
                {dragIcon}
                <ResourceIcon item={item} />

                <Tooltip
                    label={item.data.description}
                    position="top"
                    variant="xs"
                    maw={400}
                    multiline
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
                        <IconEye
                            color="var(--mantine-color-ldGray-6)"
                            size={14}
                        />

                        <Text c="ldGray.6" fz="xs">
                            {item.data.views} views
                        </Text>
                    </Flex>
                </Tooltip>

                <Box
                    className={
                        hovered || opened
                            ? classes.gridCardActionBoxVisible
                            : classes.gridCardActionBoxHidden
                    }
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    <ResourceViewActionMenu
                        item={item}
                        isOpen={opened}
                        allowDelete={allowDelete}
                        onOpen={handlers.open}
                        onClose={handlers.close}
                        onAction={onAction}
                    />
                </Box>
            </Flex>
        </Paper>
    );
};

export default ResourceViewGridChartItem;

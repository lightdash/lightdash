import { type ResourceViewChartItem } from '@lightdash/common';
import { Box, Flex, Group, Paper, Text, Tooltip } from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { VerifiedResourceIcon } from '../../ResourceIcon';
import ViewsCountPopover from '../../ViewsCountPopover';
import ResourceViewActionMenu, {
    type ResourceViewActionMenuCommonProps,
} from '../ResourceActionMenu';
import {
    getResourceViewsSinceWhenDescription,
    getViewStatsResourceType,
} from '../resourceUtils';
import classes from './ResourceViewGridItem.module.css';

interface ResourceViewGridChartItemProps extends Pick<
    ResourceViewActionMenuCommonProps,
    'onAction'
> {
    item: ResourceViewChartItem;
    projectUuid: string;
    allowDelete?: boolean;
    dragIcon: ReactNode;
}

const ResourceViewGridChartItem: FC<ResourceViewGridChartItemProps> = ({
    item,
    projectUuid,
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
                <VerifiedResourceIcon
                    item={item}
                    verification={item.data.verification}
                />

                <Tooltip
                    label={item.data.description}
                    position="top"
                    maw={400}
                    disabled={!item.data.description}
                >
                    <Text lineClamp={2} fz="sm" fw={600}>
                        {item.data.name}
                    </Text>
                </Tooltip>
            </Group>

            <Flex pl="md" pr="xs" h={32} justify="space-between" align="center">
                <ViewsCountPopover
                    resourceType={getViewStatsResourceType(item)}
                    resourceUuid={item.data.uuid}
                    projectUuid={projectUuid}
                    views={item.data.views}
                    fallbackTooltip={getResourceViewsSinceWhenDescription(item)}
                >
                    <Flex align="center" gap={4}>
                        <IconEye
                            color="var(--mantine-color-ldGray-6)"
                            size={14}
                        />

                        <Text c="dimmed" fz="xs">
                            {item.data.views} views
                        </Text>
                    </Flex>
                </ViewsCountPopover>

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

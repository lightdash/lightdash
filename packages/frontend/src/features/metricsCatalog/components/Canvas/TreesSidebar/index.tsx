import type { MetricsTreeSummary } from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Loader,
    Paper,
    ScrollArea,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconGripVertical } from '@tabler/icons-react';
import type { FC } from 'react';
import { Panel, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './TreesSidebar.module.css';

type TreeItemProps = {
    tree: MetricsTreeSummary;
    isActive: boolean;
    onSelect: (metricsTreeUuid: string) => void;
};

const TreeItem: FC<TreeItemProps> = ({ tree, isActive, onSelect }) => {
    return (
        <Paper
            p="xs"
            className={isActive ? classes.treeItemActive : classes.treeItem}
            onClick={() => onSelect(tree.metricsTreeUuid)}
        >
            <Stack gap={4}>
                <Text size="sm" fw={500} c="ldGray.7" truncate>
                    {tree.name}
                </Text>
                <Group gap="xs">
                    <Text size="xs" c="dimmed">
                        {tree.nodeCount} metric
                        {tree.nodeCount !== 1 ? 's' : ''}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                        {tree.source}
                    </Badge>
                </Group>
            </Stack>
        </Paper>
    );
};

type TreesSidebarProps = {
    trees: MetricsTreeSummary[];
    selectedTreeUuid: string | null;
    onSelectTree: (metricsTreeUuid: string) => void;
    isLoading: boolean;
};

const TreesSidebar: FC<TreesSidebarProps> = ({
    trees,
    selectedTreeUuid,
    onSelectTree,
    isLoading,
}) => {
    return (
        <>
            <Panel
                id="trees-sidebar"
                order={1}
                defaultSize={20}
                minSize={15}
                maxSize={40}
            >
                <Paper
                    h="100%"
                    p="xs"
                    className={classes.sidebar}
                    radius={0}
                    pr={0}
                >
                    <Stack gap="sm" h="100%">
                        <Group
                            gap="sm"
                            justify="space-between"
                            px="xs"
                            wrap="nowrap"
                        >
                            <Text fz="xs" c="dimmed" fw={600}>
                                Saved trees
                            </Text>
                            {trees.length > 0 && (
                                <Text fz="xs" c="dimmed">
                                    {trees.length}
                                </Text>
                            )}
                        </Group>

                        <ScrollArea style={{ flex: 1 }} offsetScrollbars>
                            {isLoading ? (
                                <Stack align="center" mt="md">
                                    <Loader size="sm" />
                                </Stack>
                            ) : trees.length > 0 ? (
                                <Stack gap="xs">
                                    {trees.map((tree) => (
                                        <TreeItem
                                            key={tree.metricsTreeUuid}
                                            tree={tree}
                                            isActive={
                                                selectedTreeUuid ===
                                                tree.metricsTreeUuid
                                            }
                                            onSelect={onSelectTree}
                                        />
                                    ))}
                                </Stack>
                            ) : (
                                <Text fz="xs" c="dimmed" ta="center" mt="md">
                                    No saved trees yet
                                </Text>
                            )}
                        </ScrollArea>
                    </Stack>
                </Paper>
            </Panel>
            <Box component={PanelResizeHandle} className={classes.resizeHandle}>
                <MantineIcon
                    icon={IconGripVertical}
                    size={12}
                    color="ldGray.5"
                />
            </Box>
        </>
    );
};

export default TreesSidebar;

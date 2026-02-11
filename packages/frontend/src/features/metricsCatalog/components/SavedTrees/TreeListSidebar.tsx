import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconGripVertical, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Panel, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsTrees } from '../../hooks/useSavedMetricsTrees';
import {
    setActiveTreeUuid,
    setSavedTreeEditMode,
} from '../../store/metricsCatalogSlice';
import { SavedTreeEditMode } from '../../types';
import classes from './TreeListSidebar.module.css';

const TreeListSidebar: FC = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const activeTreeUuid = useAppSelector(
        (state) => state.metricsCatalog.activeTreeUuid,
    );

    const { data: treesData, isLoading } = useMetricsTrees(projectUuid);
    const trees = treesData?.data ?? [];

    const handleSelectTree = (metricsTreeUuid: string) => {
        dispatch(setActiveTreeUuid(metricsTreeUuid));
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
    };

    const handleNewTree = () => {
        dispatch(setActiveTreeUuid(null));
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.EDIT));
    };

    return (
        <>
            <Panel
                id="tree-list-sidebar"
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
                            <Text fz="sm" fw={600} c="ldGray.7">
                                Trees
                            </Text>
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                leftSection={
                                    <MantineIcon icon={IconPlus} size={14} />
                                }
                                onClick={handleNewTree}
                            >
                                New
                            </Button>
                        </Group>

                        <ScrollArea style={{ flex: 1 }} offsetScrollbars>
                            {isLoading ? (
                                <Text fz="xs" c="dimmed" ta="center" mt="md">
                                    Loading trees...
                                </Text>
                            ) : trees.length > 0 ? (
                                <Stack gap="xs">
                                    {trees.map((tree) => (
                                        <Paper
                                            key={tree.metricsTreeUuid}
                                            p="xs"
                                            className={`${classes.treeItem} ${
                                                activeTreeUuid ===
                                                tree.metricsTreeUuid
                                                    ? classes.treeItemActive
                                                    : ''
                                            }`}
                                            onClick={() =>
                                                handleSelectTree(
                                                    tree.metricsTreeUuid,
                                                )
                                            }
                                        >
                                            <Group
                                                gap="xs"
                                                justify="space-between"
                                                wrap="nowrap"
                                            >
                                                <Text
                                                    fz="xs"
                                                    fw={500}
                                                    c="ldGray.7"
                                                    truncate
                                                    style={{ flex: 1 }}
                                                >
                                                    {tree.name}
                                                </Text>
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="gray"
                                                >
                                                    {tree.nodeCount}
                                                </Badge>
                                            </Group>
                                            {tree.description && (
                                                <Text
                                                    fz={10}
                                                    c="dimmed"
                                                    truncate
                                                    mt={2}
                                                >
                                                    {tree.description}
                                                </Text>
                                            )}
                                        </Paper>
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

export default TreeListSidebar;

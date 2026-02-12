import type { CatalogMetricsTreeEdge } from '@lightdash/common';
import {
    Box,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import type { Edge } from '@xyflow/react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../../hooks/useMetricsCatalog';
import {
    useCreateSavedMetricsTree,
    useMetricsTreeDetails,
} from '../../hooks/useSavedMetricsTrees';
import {
    setActiveTreeUuid,
    setSavedTreeEditMode,
} from '../../store/metricsCatalogSlice';
import { SavedTreeEditMode } from '../../types';
import { mapCanvasStateToCreatePayload } from '../../utils/savedTreeDataMappers';
import SavedTreeCanvasFlow from '../Canvas/SavedTreeCanvasFlow';
import type { ExpandedNodeData } from '../Canvas/TreeComponents/nodes/ExpandedNode';
import classes from './SavedTreeCanvas.module.css';

// Stable reference to prevent Canvas memo/effect cascade on every parent re-render
const EMPTY_EDGES: CatalogMetricsTreeEdge[] = [];

type SavedTreeCanvasProps = {
    mode: SavedTreeEditMode;
    treeUuid: string | null;
};

const SavedTreeCanvas: FC<SavedTreeCanvasProps> = ({ mode, treeUuid }) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const search = useAppSelector((state) => state.metricsCatalog.search);
    const categoryFilters = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );
    const categoryFilterMode = useAppSelector(
        (state) => state.metricsCatalog.categoryFilterMode,
    );
    const tableFilters = useAppSelector(
        (state) => state.metricsCatalog.tableFilters,
    );
    const ownerFilters = useAppSelector(
        (state) => state.metricsCatalog.ownerFilters,
    );

    // For viewing existing trees
    const { data: treeDetails, isLoading: isLoadingTree } =
        useMetricsTreeDetails(projectUuid, treeUuid);

    // For edit mode: fetch all metrics for the sidebar drag-and-drop
    // Pass undefined projectUuid when not in edit mode to disable the query
    const isEditMode = mode === SavedTreeEditMode.EDIT;
    const { data: metricsData } = useMetricsCatalog({
        projectUuid: isEditMode ? projectUuid : undefined,
        pageSize: 500,
        search,
        categories: categoryFilters,
        categoriesFilterMode: categoryFilterMode,
        tables: tableFilters,
        ownerUserUuids: ownerFilters,
    });
    const allMetrics = useMemo(
        () => metricsData?.pages.flatMap((page) => page.data) ?? [],
        [metricsData],
    );

    // Edit mode state
    const [treeName, setTreeName] = useState('');
    const [hasNodes, setHasNodes] = useState(false);
    const canvasStateRef = useRef<{
        nodes: ExpandedNodeData[];
        edges: Edge[];
    }>({ nodes: [], edges: [] });

    const { mutateAsync: createTree, isLoading: isCreating } =
        useCreateSavedMetricsTree();

    const handleCanvasStateChange = useCallback(
        (nodes: ExpandedNodeData[], edges: Edge[]) => {
            canvasStateRef.current = { nodes, edges };
            // Track in state so Save button re-renders when nodes are added/removed
            setHasNodes(nodes.length > 0);
        },
        [],
    );

    const handleBack = () => {
        dispatch(setActiveTreeUuid(null));
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
    };

    const handleDiscard = () => {
        dispatch(setActiveTreeUuid(null));
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
    };

    const handleSave = async () => {
        if (!projectUuid || !treeName.trim()) return;

        const { nodes, edges } = canvasStateRef.current;
        const payload = mapCanvasStateToCreatePayload(
            treeName.trim(),
            '',
            nodes,
            edges,
        );

        const result = await createTree({
            projectUuid,
            payload,
        });

        dispatch(setActiveTreeUuid(result.metricsTreeUuid));
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
    };

    // Empty state: no tree selected and not in edit mode
    if (treeUuid === null && mode === SavedTreeEditMode.VIEW) {
        return (
            <Center h="100%">
                <SuboptimalState
                    title="No tree selected"
                    description="Select a tree from the sidebar or create a new one"
                />
            </Center>
        );
    }

    // Edit mode: creating a new tree
    if (mode === SavedTreeEditMode.EDIT && treeUuid === null) {
        return (
            <Stack h="100%" gap={0}>
                <Group
                    className={classes.header}
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                        <Button
                            variant="subtle"
                            size="compact-sm"
                            color="gray"
                            onClick={handleDiscard}
                            leftSection={
                                <MantineIcon icon={IconArrowLeft} size={14} />
                            }
                        >
                            Discard
                        </Button>
                        <TextInput
                            placeholder="Tree name"
                            value={treeName}
                            onChange={(e) => setTreeName(e.currentTarget.value)}
                            size="sm"
                            style={{ flex: 1, maxWidth: 300 }}
                        />
                    </Group>
                    <Button
                        size="compact-sm"
                        onClick={handleSave}
                        disabled={!treeName.trim() || !hasNodes}
                        loading={isCreating}
                    >
                        Save
                    </Button>
                </Group>
                <Box className={classes.canvasContainer}>
                    <SavedTreeCanvasFlow
                        metrics={allMetrics}
                        edges={EMPTY_EDGES}
                        viewOnly={false}
                        onCanvasStateChange={handleCanvasStateChange}
                    />
                </Box>
            </Stack>
        );
    }

    // View mode: loading
    if (isLoadingTree) {
        return (
            <Center h="100%">
                <Loader />
            </Center>
        );
    }

    // View mode: tree loaded
    if (treeDetails) {
        return (
            <Stack h="100%" gap={0}>
                <Group
                    className={classes.header}
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap="sm" wrap="nowrap">
                        <Button
                            variant="subtle"
                            size="compact-sm"
                            color="gray"
                            onClick={handleBack}
                            leftSection={
                                <MantineIcon icon={IconArrowLeft} size={14} />
                            }
                        >
                            Back
                        </Button>
                        <Text fz="sm" fw={600} c="ldGray.7">
                            {treeDetails.name}
                        </Text>
                    </Group>
                    <Tooltip label="Editing saved trees coming soon">
                        <Button size="compact-sm" variant="default" disabled>
                            Edit
                        </Button>
                    </Tooltip>
                </Group>
                <Box className={classes.canvasContainer}>
                    <SavedTreeCanvasFlow
                        metrics={treeDetails.nodes}
                        edges={treeDetails.edges}
                        viewOnly
                    />
                </Box>
            </Stack>
        );
    }

    return null;
};

export default SavedTreeCanvas;

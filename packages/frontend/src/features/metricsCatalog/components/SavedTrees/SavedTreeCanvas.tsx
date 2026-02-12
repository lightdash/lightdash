import type { CatalogMetricsTreeEdge } from '@lightdash/common';
import {
    Badge,
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
import { useWindowEvent } from '@mantine-8/hooks';
import { IconLock, IconPencil } from '@tabler/icons-react';
import type { Edge } from '@xyflow/react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { BASE_API_URL } from '../../../../api';
import MantineIcon from '../../../../components/common/MantineIcon';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsCatalog } from '../../hooks/useMetricsCatalog';
import {
    useAcquireTreeLock,
    useCreateSavedMetricsTree,
    useMetricsTreeDetails,
    useReleaseTreeLock,
    useTreeLockHeartbeat,
    useUpdateSavedMetricsTree,
} from '../../hooks/useSavedMetricsTrees';
import {
    setActiveTreeUuid,
    setSavedTreeEditMode,
} from '../../store/metricsCatalogSlice';
import { SavedTreeEditMode } from '../../types';
import {
    mapCanvasStateToCreatePayload,
    mapCanvasStateToUpdatePayload,
} from '../../utils/savedTreeDataMappers';
import { clearDraft, saveDraft } from '../../utils/treeDraftStorage';
import type { CanvasMetric } from '../Canvas/canvasLayoutUtils';
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

    const { data: treeDetails, isLoading: isLoadingTree } =
        useMetricsTreeDetails(projectUuid, treeUuid);

    const isEditMode = mode === SavedTreeEditMode.EDIT;
    const { data: metricsData } = useMetricsCatalog({
        projectUuid: isEditMode ? projectUuid : undefined,
        pageSize: 50,
        categories: categoryFilters,
        categoriesFilterMode: categoryFilterMode,
        tables: tableFilters,
        ownerUserUuids: ownerFilters,
    });
    const allMetrics = useMemo(
        () => metricsData?.pages.flatMap((page) => page.data) ?? [],
        [metricsData],
    );

    const isEditingExisting = isEditMode && treeUuid !== null;

    // Merge filtered catalog metrics with tree nodes so canvas nodes are always present
    const mergedMetrics = useMemo<CanvasMetric[]>(() => {
        const metricsMap = new Map<string, CanvasMetric>();
        // Tree nodes first (with positions) — ensures canvas nodes are always present
        if (isEditingExisting && treeDetails) {
            treeDetails.nodes.forEach((node) =>
                metricsMap.set(node.catalogSearchUuid, node),
            );
        }
        // Filtered catalog metrics on top, preserving saved positions from tree nodes
        allMetrics.forEach((metric) => {
            const existing = metricsMap.get(metric.catalogSearchUuid);
            metricsMap.set(metric.catalogSearchUuid, {
                ...metric,
                xPosition: existing?.xPosition,
                yPosition: existing?.yPosition,
            });
        });
        return Array.from(metricsMap.values());
    }, [allMetrics, isEditingExisting, treeDetails]);

    const sidebarFilter = useCallback(
        (node: ExpandedNodeData) => {
            if (!search) return true;
            const term = search.toLowerCase();
            return (
                node.data.label.toLowerCase().includes(term) ||
                node.data.tableName.toLowerCase().includes(term)
            );
        },
        [search],
    );

    const [treeName, setTreeName] = useState('');
    const [hasNodes, setHasNodes] = useState(false);
    const canvasStateRef = useRef<{
        nodes: ExpandedNodeData[];
        edges: Edge[];
    }>({ nodes: [], edges: [] });

    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { mutateAsync: createTree, isLoading: isCreating } =
        useCreateSavedMetricsTree();
    const { mutateAsync: updateTree, isLoading: isUpdating } =
        useUpdateSavedMetricsTree();
    const { mutateAsync: acquireLock, isLoading: isAcquiringLock } =
        useAcquireTreeLock();
    const { mutateAsync: releaseLock } = useReleaseTreeLock();

    const handleLockLost = useCallback(() => {
        if (treeUuid) {
            clearDraft(treeUuid);
        }
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
    }, [dispatch, treeUuid]);

    useTreeLockHeartbeat(
        projectUuid,
        treeUuid,
        isEditingExisting,
        handleLockLost,
    );

    useWindowEvent('beforeunload', (e) => {
        if (!isEditingExisting || !projectUuid || !treeUuid) return;
        e.preventDefault();
    });

    // Release lock on page teardown (keepalive fetch survives unload; React Query cannot)
    useWindowEvent('unload', () => {
        if (!isEditingExisting || !projectUuid || !treeUuid) return;
        const url = `${BASE_API_URL}api/v1/projects/${projectUuid}/dataCatalog/metrics/trees/${treeUuid}/lock`;
        void fetch(url, { method: 'DELETE', keepalive: true });
    });

    useEffect(() => {
        if (isEditingExisting && treeDetails) {
            setTreeName(treeDetails.name);
        }
    }, [isEditingExisting, treeDetails]);

    const treeNameRef = useRef(treeName);
    useEffect(() => {
        treeNameRef.current = treeName;
    }, [treeName]);

    const generationRef = useRef(treeDetails?.generation ?? 1);
    useEffect(() => {
        if (treeDetails) {
            generationRef.current = treeDetails.generation;
        }
    }, [treeDetails]);

    const handleCanvasStateChange = useCallback(
        (nodes: ExpandedNodeData[], edges: Edge[]) => {
            canvasStateRef.current = { nodes, edges };
            setHasNodes(nodes.length > 0);

            // Auto-save draft for existing tree edits
            if (treeUuid) {
                if (draftTimerRef.current) {
                    clearTimeout(draftTimerRef.current);
                }
                draftTimerRef.current = setTimeout(() => {
                    saveDraft(treeUuid, {
                        nodes: nodes.map((n) => ({
                            catalogSearchUuid: n.id,
                            xPosition: Math.round(n.position.x),
                            yPosition: Math.round(n.position.y),
                        })),
                        edges: edges.map((e) => ({
                            sourceCatalogSearchUuid: e.source,
                            targetCatalogSearchUuid: e.target,
                        })),
                        name: treeNameRef.current,
                        description: '',
                        savedAt: Date.now(),
                        generation: generationRef.current,
                    });
                }, 1000);
            }
        },
        [treeUuid],
    );

    const handleBack = () => {
        dispatch(setActiveTreeUuid(null));
        dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
    };

    const handleDiscard = () => {
        if (isEditingExisting && projectUuid && treeUuid) {
            clearDraft(treeUuid);
            void releaseLock({
                projectUuid,
                metricsTreeUuid: treeUuid,
            });
        }
        if (isEditingExisting) {
            // Go back to view mode for this tree
            dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
        } else {
            dispatch(setActiveTreeUuid(null));
            dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
        }
    };

    const handleSave = async () => {
        if (!projectUuid || !treeName.trim()) return;

        const { nodes, edges } = canvasStateRef.current;

        if (isEditingExisting && treeUuid) {
            // Update existing tree
            const payload = mapCanvasStateToUpdatePayload(
                treeName.trim(),
                '',
                generationRef.current,
                nodes,
                edges,
            );

            await updateTree({
                projectUuid,
                metricsTreeUuid: treeUuid,
                payload,
            });

            clearDraft(treeUuid);
            dispatch(setSavedTreeEditMode(SavedTreeEditMode.VIEW));
        } else {
            // Create new tree
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
        }
    };

    const handleEditClick = async () => {
        if (!projectUuid || !treeUuid) return;

        await acquireLock({
            projectUuid,
            metricsTreeUuid: treeUuid,
        });

        dispatch(setSavedTreeEditMode(SavedTreeEditMode.EDIT));
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

    // Edit mode: creating a new tree OR editing an existing tree
    if (isEditMode) {
        return (
            <Stack h="100%" gap={0}>
                <Group
                    className={classes.header}
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                        <TextInput
                            placeholder="Tree name"
                            value={treeName}
                            onChange={(e) => setTreeName(e.currentTarget.value)}
                            size="sm"
                            style={{ flex: 1, maxWidth: 300 }}
                        />
                    </Group>
                    <Group gap="sm" wrap="nowrap">
                        <Button
                            variant="default"
                            size="compact-sm"
                            color="gray"
                            onClick={handleDiscard}
                        >
                            Discard
                        </Button>
                        <Button
                            size="compact-sm"
                            onClick={handleSave}
                            disabled={!treeName.trim() || !hasNodes}
                            loading={isCreating || isUpdating}
                        >
                            Save
                        </Button>
                    </Group>
                </Group>
                <Box className={classes.canvasContainer}>
                    <SavedTreeCanvasFlow
                        metrics={mergedMetrics}
                        edges={
                            isEditingExisting && treeDetails
                                ? treeDetails.edges
                                : EMPTY_EDGES
                        }
                        viewOnly={false}
                        onCanvasStateChange={handleCanvasStateChange}
                        sidebarFilter={sidebarFilter}
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
        const lockByOther =
            treeDetails.lock !== null &&
            treeDetails.lock.lockedByUserUuid !== undefined;

        return (
            <Stack h="100%" gap={0}>
                <Group
                    className={classes.header}
                    justify="space-between"
                    wrap="nowrap"
                    h="60px"
                >
                    <Group gap="sm" wrap="nowrap">
                        <Text fz="sm" fw={600} c="ldGray.7">
                            {treeDetails.name}
                        </Text>
                        {lockByOther && (
                            <Badge
                                size="sm"
                                variant="light"
                                color="yellow"
                                leftSection={
                                    <MantineIcon icon={IconLock} size={12} />
                                }
                            >
                                Editing by {treeDetails.lock!.lockedByUserName}
                            </Badge>
                        )}
                    </Group>
                    <Group gap="xs">
                        <Button
                            variant="default"
                            size="compact-sm"
                            color="gray"
                            onClick={handleBack}
                        >
                            Close
                        </Button>
                        {lockByOther ? (
                            <Tooltip
                                label={`Being edited by ${treeDetails.lock!.lockedByUserName}`}
                            >
                                <Button
                                    size="compact-sm"
                                    variant="default"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconPencil}
                                            size={14}
                                        />
                                    }
                                    disabled
                                >
                                    Edit
                                </Button>
                            </Tooltip>
                        ) : (
                            <Button
                                size="compact-sm"
                                variant="default"
                                onClick={handleEditClick}
                                loading={isAcquiringLock}
                                leftSection={
                                    <MantineIcon icon={IconPencil} size={14} />
                                }
                            >
                                Edit
                            </Button>
                        )}
                    </Group>
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

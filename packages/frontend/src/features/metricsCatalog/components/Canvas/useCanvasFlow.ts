import { TimeFrames, type CatalogMetricsTreeEdge } from '@lightdash/common';
import {
    MarkerType,
    addEdge,
    useEdgesState,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
    type Connection,
    type Edge,
    type EdgeChange,
    type NodeChange,
    type NodePositionChange,
    type NodeRemoveChange,
    type NodeReplaceChange,
} from '@xyflow/react';
import partition from 'lodash/partition';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    DEFAULT_CANVAS_TIME_OPTION,
    type CanvasTimeOption,
} from '../visualization/canvasTimeFramePickerOptions';
import {
    buildAllNodes,
    buildInitialEdges,
    buildInitialNodes,
    getNodeLayout,
    getPersistedPositionIds,
    type CanvasMetric,
} from './canvasLayoutUtils';
import type { ExpandedNodeData } from './TreeComponents/nodes/ExpandedNode';

type UseCanvasFlowArgs = {
    metrics: CanvasMetric[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly: boolean;
    /** Called after a connection is added to local state */
    onEdgeCreated?: (params: Connection) => Promise<void>;
    /** Called when edges are deleted. Only non-yaml edges are passed. */
    onEdgesDeleted?: (edges: Edge[]) => Promise<void>;
    /** When true, skip resetting canvas state on prop changes after first init */
    preventResetAfterInit?: boolean;
    /** Called when canvas nodes/edges change so parent can capture state */
    onCanvasStateChange?: (nodes: ExpandedNodeData[], edges: Edge[]) => void;
};

export const useCanvasFlow = ({
    metrics,
    edges: edgesProp,
    onEdgeCreated,
    onEdgesDeleted,
    preventResetAfterInit = false,
    onCanvasStateChange,
}: UseCanvasFlowArgs) => {
    const { fitView, getNode, getEdge, screenToFlowPosition } = useReactFlow<
        ExpandedNodeData,
        Edge
    >();
    const nodesInitialized = useNodesInitialized();
    const [isLayoutReady, setIsLayoutReady] = useState(false);
    const { showToastInfo } = useToaster();
    const [canvasTimeOption, setCanvasTimeOption] = useState<CanvasTimeOption>(
        DEFAULT_CANVAS_TIME_OPTION,
    );

    // Derive timeFrame and rollingDays from the canvas time option
    const timeFrame =
        canvasTimeOption.type === 'calendar'
            ? canvasTimeOption.timeFrame
            : TimeFrames.DAY;
    const rollingDays =
        canvasTimeOption.type === 'rolling'
            ? canvasTimeOption.rollingDays
            : undefined;

    const timeValuesRef = useRef({ timeFrame, rollingDays });
    useEffect(() => {
        timeValuesRef.current = { timeFrame, rollingDays };
    }, [timeFrame, rollingDays]);

    // Compute derived data using extracted utilities
    const persistedPositionIds = useMemo(
        () => getPersistedPositionIds(metrics),
        [metrics],
    );

    const initialEdges = useMemo<Edge[]>(
        () => buildInitialEdges(edgesProp, metrics),
        [edgesProp, metrics],
    );

    const allNodes = useMemo<ExpandedNodeData[]>(
        () => buildAllNodes(metrics, initialEdges),
        [metrics, initialEdges],
    );

    const initialNodes = useMemo<ExpandedNodeData[]>(
        () => buildInitialNodes(allNodes, initialEdges, persistedPositionIds),
        [allNodes, initialEdges, persistedPositionIds],
    );

    const [currentNodes, setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    // Track whether the canvas has been initialized (used to prevent resets in draft mode)
    const isCanvasInitializedRef = useRef(false);

    // YAML edge deletion protection
    const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const [blockedYamlChanges, allowedChanges] = partition(
                changes,
                (change) => {
                    if (change.type !== 'remove') return false;
                    return getEdge(change.id)?.type === 'yaml';
                },
            );
            if (blockedYamlChanges.length > 0) {
                showToastInfo({
                    title: 'Cannot delete YAML-defined edge',
                    subtitle:
                        'This connection is defined in your dbt YAML files. Update your YAML to remove it.',
                });
            }

            onEdgesChange(allowedChanges);
        },
        [getEdge, onEdgesChange, showToastInfo],
    );

    // Dagre layout
    const applyLayout = useCallback(
        ({
            renderTwice = true,
            removeUnconnected = false,
        }: { renderTwice?: boolean; removeUnconnected?: boolean } = {}) => {
            const nodesToLayout = removeUnconnected
                ? currentNodes.filter((node) =>
                      currentEdges.some(
                          (edge) =>
                              edge.source === node.id ||
                              edge.target === node.id,
                      ),
                  )
                : currentNodes;

            // Skip layout if nodes aren't measured yet
            const allNodesMeasured = nodesToLayout.every(
                (node) => node.measured?.width && node.measured?.height,
            );
            if (!allNodesMeasured && renderTwice) {
                setTimeout(() => {
                    applyLayout({ renderTwice: true, removeUnconnected });
                }, 50);
                return;
            }

            const layout = getNodeLayout(nodesToLayout, currentEdges);

            setCurrentNodes(layout.nodes);
            setCurrentEdges(layout.edges);
            setIsLayoutReady(true);

            if (renderTwice) {
                setTimeout(() => {
                    applyLayout({ renderTwice: false, removeUnconnected });
                }, 10);

                return;
            }

            window.requestAnimationFrame(() => {
                void fitView({ maxZoom: 1.2 });
            });
        },
        [currentNodes, currentEdges, setCurrentNodes, setCurrentEdges, fitView],
    );

    // Node position change handling
    const handleNodePositionChange = useCallback(
        (changes: NodePositionChange[]) => {
            return changes.map((c) => {
                const node = getNode(c.id);

                if (!node) {
                    return c;
                }

                return {
                    id: c.id,
                    type: 'replace',
                    item: {
                        ...node,
                        position: c.position ?? node.position,
                    },
                } satisfies NodeReplaceChange<ExpandedNodeData>;
            });
        },
        [getNode],
    );

    const handleNodeChange = useCallback(
        (changes: NodeChange<ExpandedNodeData>[]) => {
            // Only prevent 'replace' changes, allow 'remove' so users can delete nodes
            const preventedChangeTypes: NodeChange<ExpandedNodeData>['type'][] =
                ['replace'];

            const changesWithoutPreventedTypes = changes.filter(
                (c) => !preventedChangeTypes.includes(c.type),
            );

            const positionChanges = changesWithoutPreventedTypes.filter(
                // Position change infer in vscode was correct but not in build, fixed by type assertion
                (c): c is NodePositionChange => c.type === 'position',
            );

            const otherChanges = changesWithoutPreventedTypes.filter(
                (c) => c.type !== 'position',
            );

            const positionChangesToApply =
                handleNodePositionChange(positionChanges);

            onNodesChange([...positionChangesToApply, ...otherChanges]);
        },
        [handleNodePositionChange, onNodesChange],
    );

    // Connect handler: adds edge locally, then delegates to callback
    const handleConnect = useCallback(
        async (params: Connection) => {
            setCurrentEdges((edg) =>
                addEdge(
                    {
                        ...params,
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                        },
                    },
                    edg,
                ),
            );

            if (onEdgeCreated) {
                await onEdgeCreated(params);
            }
        },
        [setCurrentEdges, onEdgeCreated],
    );

    // Delete handler: filters yaml edges, then delegates to callback
    const handleEdgesDelete = useCallback(
        async (edgesToDelete: Edge[]) => {
            if (onEdgesDeleted) {
                const deletableEdges = edgesToDelete.filter(
                    (edge) => edge.type !== 'yaml',
                );
                await onEdgesDeleted(deletableEdges);
            }
        },
        [onEdgesDeleted],
    );

    // Drag-drop handlers
    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const data = event.dataTransfer.getData('application/reactflow');
            if (!data) return;

            const { catalogSearchUuid } = JSON.parse(data);

            const nodeData = allNodes.find((n) => n.id === catalogSearchUuid);
            if (!nodeData) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            setCurrentNodes((nodes) => {
                if (nodes.some((n) => n.id === catalogSearchUuid)) return nodes;

                const newNode: ExpandedNodeData = {
                    ...nodeData,
                    position,
                    data: {
                        ...nodeData.data,
                        timeFrame,
                        rollingDays,
                    },
                };
                return [...nodes, newNode];
            });
        },
        [
            allNodes,
            screenToFlowPosition,
            setCurrentNodes,
            timeFrame,
            rollingDays,
        ],
    );

    // Reset layout when initial edges or nodes change
    useEffect(() => {
        if (preventResetAfterInit && isCanvasInitializedRef.current) return;
        isCanvasInitializedRef.current = true;

        // Apply current timeFrame and rollingDays to initial nodes (using ref to avoid dependency)
        const { timeFrame: currentTimeFrame, rollingDays: currentRollingDays } =
            timeValuesRef.current;
        const nodesWithTimeData = initialNodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                timeFrame: currentTimeFrame,
                rollingDays: currentRollingDays,
            },
        }));
        setCurrentNodes(nodesWithTimeData);
        setCurrentEdges(initialEdges);
        setIsLayoutReady(false);
    }, [
        initialNodes,
        initialEdges,
        setCurrentNodes,
        setCurrentEdges,
        preventResetAfterInit,
    ]);

    // Apply layout when nodes are initialized and the initial layout is not ready.
    // Skip Dagre layout when all nodes have saved positions (they're already placed correctly).
    useEffect(() => {
        if (nodesInitialized && !isLayoutReady && currentNodes.length > 0) {
            const allHaveSavedPositions =
                persistedPositionIds.size > 0 &&
                currentNodes.every((node) => persistedPositionIds.has(node.id));

            if (allHaveSavedPositions) {
                setIsLayoutReady(true);
                window.requestAnimationFrame(() => {
                    void fitView({ maxZoom: 1.2 });
                });
            } else {
                applyLayout();
            }
        }
    }, [
        applyLayout,
        nodesInitialized,
        isLayoutReady,
        currentNodes,
        persistedPositionIds,
        fitView,
    ]);

    // Propagate time frame changes to all nodes
    useEffect(() => {
        setCurrentNodes((nodes) =>
            nodes.map((node) => ({
                ...node,
                data:
                    'timeFrame' in node.data
                        ? { ...node.data, timeFrame, rollingDays }
                        : node.data,
            })),
        );
    }, [timeFrame, rollingDays, setCurrentNodes]);

    // Remove nodes from canvas if they no longer exist in metrics
    const removeNodeChanges = useMemo<NodeRemoveChange[]>(() => {
        return currentNodes
            .filter((node) => !allNodes.some((n) => n.id === node.id))
            .map((node) => ({
                id: node.id,
                type: 'remove',
            }));
    }, [currentNodes, allNodes]);

    useEffect(() => {
        if (removeNodeChanges.length > 0) {
            onNodesChange(removeNodeChanges);
        }
    }, [removeNodeChanges, onNodesChange]);

    // Notify parent of canvas state changes for save functionality
    useEffect(() => {
        if (onCanvasStateChange) {
            onCanvasStateChange(currentNodes, currentEdges);
        }
    }, [currentNodes, currentEdges, onCanvasStateChange]);

    // Sidebar nodes: all nodes not currently on the canvas
    const sidebarNodes = useMemo(() => {
        return allNodes.filter(
            (node) => !currentNodes.some((n) => n.id === node.id),
        );
    }, [currentNodes, allNodes]);

    return {
        currentNodes,
        currentEdges,
        handleNodeChange,
        handleEdgesChange,
        handleConnect,
        handleDragOver,
        handleDrop,
        handleEdgesDelete,
        applyLayout,
        sidebarNodes,
        canvasTimeOption,
        setCanvasTimeOption,
    };
};

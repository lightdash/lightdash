import { TimeFrames, type CatalogMetricsTreeEdge } from '@lightdash/common';
import {
    addEdge,
    MarkerType,
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
    /** Optional filter applied only to sidebar nodes (not to canvas nodes) */
    sidebarFilter?: (node: ExpandedNodeData) => boolean;
    /** All YAML edges for the project — used to inject YAML edges reactively in edit mode */
    allProjectYamlEdges?: CatalogMetricsTreeEdge[];
};

export const useCanvasFlow = ({
    metrics,
    edges: edgesProp,
    viewOnly,
    onEdgeCreated,
    onEdgesDeleted,
    preventResetAfterInit = false,
    onCanvasStateChange,
    sidebarFilter,
    allProjectYamlEdges,
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
    timeValuesRef.current = { timeFrame, rollingDays };

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

    // Sync refs during render so stable callbacks always read fresh state
    const nodesRef = useRef(currentNodes);
    nodesRef.current = currentNodes;
    const edgesRef = useRef(currentEdges);
    edgesRef.current = currentEdges;

    // Track whether the canvas has been initialized (used to prevent resets in draft mode)
    const isCanvasInitializedRef = useRef(false);

    // Track reset cycles to avoid stale time-propagation writes (Fix 3)
    const resetCountRef = useRef(0);
    const lastSeenResetRef = useRef(0);

    // --- Reactive YAML edge injection (edit mode only) ---
    // Stable string of sorted canvas node IDs — avoids re-running on every drag/reposition
    const canvasNodeIdString = useMemo(
        () =>
            currentNodes
                .map((n) => n.id)
                .sort()
                .join(','),
        [currentNodes],
    );

    // Convert API YAML edges to ReactFlow edges, filtered to nodes currently on canvas
    const yamlEdgesForCanvas = useMemo<Edge[]>(() => {
        if (!allProjectYamlEdges?.length) return [];
        const nodeIds = new Set(canvasNodeIdString.split(','));
        return allProjectYamlEdges
            .filter(
                (e) =>
                    nodeIds.has(e.source.catalogSearchUuid) &&
                    nodeIds.has(e.target.catalogSearchUuid),
            )
            .map((e) => ({
                id: `${e.source.catalogSearchUuid}_${e.target.catalogSearchUuid}`,
                source: e.source.catalogSearchUuid,
                target: e.target.catalogSearchUuid,
                type: 'yaml' as const,
                markerEnd: { type: MarkerType.ArrowClosed },
            }));
    }, [allProjectYamlEdges, canvasNodeIdString]);

    // Sync YAML edges into currentEdges: add new ones, remove stale ones
    useEffect(() => {
        if (!allProjectYamlEdges) return; // Feature not active
        setCurrentEdges((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const yamlIdsForCanvas = new Set(
                yamlEdgesForCanvas.map((e) => e.id),
            );
            // Remove stale YAML edges (node removed from canvas)
            const withoutStale = prev.filter(
                (e) => e.type !== 'yaml' || yamlIdsForCanvas.has(e.id),
            );
            // Add new YAML edges (node added to canvas)
            const newEdges = yamlEdgesForCanvas.filter(
                (e) => !existingIds.has(e.id),
            );
            if (newEdges.length === 0 && withoutStale.length === prev.length) {
                return prev; // Referential stability — no re-render
            }
            return [...withoutStale, ...newEdges];
        });
    }, [allProjectYamlEdges, yamlEdgesForCanvas, setCurrentEdges]);

    // YAML edge deletion protection — silently filter YAML removals
    // (handles both explicit deletion and cascade from node removal)
    const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const allowedChanges = changes.filter((change) => {
                if (change.type !== 'remove') return true;
                return getEdge(change.id)?.type !== 'yaml';
            });

            onEdgesChange(allowedChanges);
        },
        [getEdge, onEdgesChange],
    );

    // Dagre layout — reads from refs so the callback is stable across node/edge changes
    const applyLayout = useCallback(
        ({
            renderTwice = true,
            removeUnconnected = false,
        }: { renderTwice?: boolean; removeUnconnected?: boolean } = {}) => {
            const nodes = nodesRef.current;
            const edges = edgesRef.current;

            const nodesToLayout = removeUnconnected
                ? nodes.filter((node) =>
                      edges.some(
                          (edge) =>
                              edge.source === node.id ||
                              edge.target === node.id,
                      ),
                  )
                : nodes;

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

            const layout = getNodeLayout(nodesToLayout, edges);

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
        [setCurrentNodes, setCurrentEdges, fitView],
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

    // Delete handler: filters yaml edges, shows toast for blocked ones, then delegates to callback
    const handleEdgesDelete = useCallback(
        async (edgesToDelete: Edge[]) => {
            const hasYamlEdges = edgesToDelete.some(
                (edge) => edge.type === 'yaml',
            );
            if (hasYamlEdges) {
                showToastInfo({
                    title: 'Cannot delete YAML-defined edge',
                    subtitle:
                        'This connection is defined in your dbt YAML files. Update your YAML to remove it.',
                });
            }
            if (onEdgesDeleted) {
                const deletableEdges = edgesToDelete.filter(
                    (edge) => edge.type !== 'yaml',
                );
                await onEdgesDeleted(deletableEdges);
            }
        },
        [onEdgesDeleted, showToastInfo],
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
        resetCountRef.current += 1;
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
        const nodes = nodesRef.current;
        if (nodesInitialized && !isLayoutReady && nodes.length > 0) {
            const allHaveSavedPositions =
                persistedPositionIds.size > 0 &&
                nodes.every((node) => persistedPositionIds.has(node.id));

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
        persistedPositionIds,
        fitView,
    ]);

    // Propagate time frame changes to all nodes.
    // Skip when a reset just ran — the reset effect already applied current time values.
    useEffect(() => {
        if (resetCountRef.current !== lastSeenResetRef.current) {
            lastSeenResetRef.current = resetCountRef.current;
            return;
        }
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

    // Remove nodes from canvas if they no longer exist in metrics.
    // In edit mode, skip auto-removal so filtered metrics don't remove canvas nodes.
    const removeNodeChanges = useMemo<NodeRemoveChange[]>(() => {
        if (!viewOnly) return [];
        return currentNodes
            .filter((node) => !allNodes.some((n) => n.id === node.id))
            .map((node) => ({
                id: node.id,
                type: 'remove',
            }));
    }, [currentNodes, allNodes, viewOnly]);

    useEffect(() => {
        if (removeNodeChanges.length > 0) {
            onNodesChange(removeNodeChanges);
        }
    }, [removeNodeChanges, onNodesChange]);

    const prevStructureRef = useRef('');
    const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!onCanvasStateChange) return;

        const edgeIdString = currentEdges
            .map((e) => e.id)
            .sort()
            .join(',');
        const structureKey = `${canvasNodeIdString}|${edgeIdString}`;
        const isStructuralChange = structureKey !== prevStructureRef.current;
        prevStructureRef.current = structureKey;

        if (isStructuralChange) {
            if (notifyTimerRef.current) {
                clearTimeout(notifyTimerRef.current);
                notifyTimerRef.current = null;
            }
            onCanvasStateChange(currentNodes, currentEdges);
            return;
        }

        if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = setTimeout(() => {
            notifyTimerRef.current = null;
            onCanvasStateChange(currentNodes, currentEdges);
        }, 150);

        return () => {
            if (notifyTimerRef.current) {
                clearTimeout(notifyTimerRef.current);
                notifyTimerRef.current = null;
            }
        };
    }, [currentNodes, currentEdges, canvasNodeIdString, onCanvasStateChange]);

    // Sidebar nodes: all nodes not currently on the canvas, optionally filtered
    const sidebarNodes = useMemo(() => {
        const notOnCanvas = allNodes.filter(
            (node) => !currentNodes.some((n) => n.id === node.id),
        );
        return sidebarFilter ? notOnCanvas.filter(sidebarFilter) : notOnCanvas;
    }, [currentNodes, allNodes, sidebarFilter]);

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

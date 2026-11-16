/**
 * A read-only diagram of the dbt models behind an explore's tables and the
 * models built from them. Clicking a model focuses its upstream and downstream.
 */
import { Box, Group, Loader, Paper, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import {
    Background,
    Controls,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type Edge,
    type EdgeTypes,
    type Node,
    type NodeProps,
    type NodeTypes,
} from '@xyflow/react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import '@xyflow/react/dist/style.css';
import MantineIcon from '../../components/common/MantineIcon';
import DefaultEdge from '../../components/common/ReactFlow/DefaultEdge';
import reactFlowStyles from '../../components/common/ReactFlow/reactFlow.module.css';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import classes from './JoinDiagram.module.css';
import {
    JOIN_NODE_HEIGHT,
    JOIN_NODE_WIDTH,
    layoutJoinGraph,
} from './joinGraph';
import {
    relatedModels,
    toModelLineage,
    type LineageModelNode,
    type LineageRole,
} from './lineageGraph';

type ModelNodeData = LineageModelNode & {
    /** Another model is selected and this one is not upstream or downstream of it. */
    isDimmed: boolean;
    isSelected: boolean;
};

type ModelFlowNode = Node<ModelNodeData, 'model'>;

const ROLE_LABELS: Record<LineageRole, string> = {
    base: 'Base table',
    joined: 'Joined table',
    upstream: 'Upstream model',
    downstream: 'Downstream model',
    other: 'dbt model',
};

/** Global so the stylesheet can target it; edges take no CSS module class. */
const EDGE_ACTIVE_CLASS = 'join-edge-active';

const ModelNode: FC<NodeProps<ModelFlowNode>> = ({ data }) => (
    <Paper
        component="button"
        type="button"
        w={JOIN_NODE_WIDTH}
        h={JOIN_NODE_HEIGHT}
        className={classes.node}
        data-base={data.role === 'base' || data.role === 'joined'}
        data-dimmed={data.isDimmed}
        data-selected={data.isSelected}
        aria-pressed={data.isSelected}
        aria-label={`Show the lineage of ${data.id}`}
    >
        <Handle
            type="target"
            position={Position.Left}
            className={classes.handle}
        />
        <Group
            gap="xs"
            wrap="nowrap"
            align="flex-start"
            className={classes.nodeHead}
        >
            <Box className={classes.nodeIcon}>
                <MantineIcon icon={IconTable} size={14} />
            </Box>
            <Box className={classes.nodeText}>
                <Text component="span" className={classes.nodeTitle} truncate>
                    {data.label ?? data.id}
                </Text>
                <Text
                    component="span"
                    className={classes.nodeSubtitle}
                    truncate
                >
                    {data.id}
                </Text>
            </Box>
        </Group>
        <Group gap="xs" wrap="nowrap" className={classes.nodeFooter}>
            <Text component="span" fz="xs" c="dimmed">
                {ROLE_LABELS[data.role]}
            </Text>
        </Group>
        <Handle
            type="source"
            position={Position.Right}
            className={classes.handle}
        />
    </Paper>
);

const nodeTypes: NodeTypes = { model: ModelNode };
const edgeTypes: EdgeTypes = { lineage: DefaultEdge };

// Centred; never larger than 100%, and wide graphs stay readable and pan.
const FIT_VIEW_OPTIONS = { padding: 0.15, minZoom: 0.6, maxZoom: 1 };

export const LineageDiagram: FC<{
    projectUuid: string;
    exploreName: string;
}> = ({ projectUuid, exploreName }) => {
    const { data: explore, isInitialLoading } = useExploreByProjectUuid(
        exploreName,
        projectUuid,
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const lineage = useMemo(
        () => (explore ? toModelLineage(explore) : null),
        [explore],
    );
    const positions = useMemo(
        () =>
            lineage
                ? layoutJoinGraph({
                      tables: lineage.models,
                      links: lineage.links,
                  })
                : null,
        [lineage],
    );
    const flow = useMemo(() => {
        if (!lineage || !positions) return null;
        const related = selectedId
            ? relatedModels(lineage.links, selectedId)
            : null;
        const nodes = lineage.models.map<ModelFlowNode>((model) => ({
            id: model.id,
            type: 'model',
            position: positions.get(model.id) ?? { x: 0, y: 0 },
            data: {
                ...model,
                isDimmed: related !== null && !related.has(model.id),
                isSelected: model.id === selectedId,
            },
        }));
        const edges = lineage.links.map<Edge>((link) => ({
            id: link.id,
            source: link.source,
            target: link.target,
            type: 'lineage',
            className: clsx(
                related?.has(link.source) &&
                    related.has(link.target) &&
                    EDGE_ACTIVE_CLASS,
            ),
        }));
        return { nodes, edges };
    }, [lineage, positions, selectedId]);

    if (isInitialLoading) {
        return (
            <Group justify="center" py="xl">
                <Loader size="sm" />
            </Group>
        );
    }
    if (!lineage || !flow) return null;
    if (lineage.links.length === 0) {
        return (
            <Paper variant="dotted" p="md">
                <Text fz="sm" c="dimmed">
                    The dbt models behind this explore have no dependencies on
                    other models, and no models are built from them.
                </Text>
            </Paper>
        );
    }
    return (
        <Box className={classes.root}>
            <Paper withBorder className={classes.canvas}>
                <ReactFlowProvider>
                    <ReactFlow<ModelFlowNode, Edge>
                        className={clsx(
                            reactFlowStyles.reactFlow,
                            classes.flow,
                        )}
                        nodes={flow.nodes}
                        edges={flow.edges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        fitView
                        fitViewOptions={FIT_VIEW_OPTIONS}
                        onNodeClick={(_, node) =>
                            setSelectedId((current) =>
                                current === node.id ? null : node.id,
                            )
                        }
                        onPaneClick={() => setSelectedId(null)}
                        minZoom={0.25}
                        maxZoom={1.5}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        nodesFocusable={false}
                        edgesFocusable={false}
                        elementsSelectable={false}
                        zoomOnScroll={false}
                        panOnScroll
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background />
                        <Controls showInteractive={false} />
                    </ReactFlow>
                </ReactFlowProvider>
            </Paper>
        </Box>
    );
};

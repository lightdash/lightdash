/** A read-only diagram of an explore's base table and the tables joined to it. */
import { Badge, Box, Group, Loader, Paper, Text, Tooltip } from '@mantine/core';
import {
    Background,
    BaseEdge,
    Controls,
    EdgeLabelRenderer,
    getSmoothStepPath,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type Edge,
    type EdgeProps,
    type EdgeTypes,
    type Node,
    type NodeProps,
    type NodeTypes,
} from '@xyflow/react';
import { clsx } from 'clsx';
import { useMemo, type FC } from 'react';
import '@xyflow/react/dist/style.css';
import reactFlowStyles from '../../components/common/ReactFlow/reactFlow.module.css';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import classes from './JoinDiagram.module.css';
import {
    cardinalityOf,
    isFanOut,
    layoutJoinGraph,
    toJoinGraph,
    type JoinLink,
    type JoinTableNode,
} from './joinGraph';

type TableFlowNode = Node<JoinTableNode, 'table'>;
type JoinFlowEdge = Edge<JoinLink, 'join'>;

const TableNode: FC<NodeProps<TableFlowNode>> = ({ data }) => (
    <Paper
        withBorder
        className={clsx(classes.node, data.isBase && classes.baseNode)}
    >
        <Handle
            type="target"
            position={Position.Left}
            className={classes.handle}
            isConnectable={false}
        />
        <Group gap={6} wrap="nowrap" justify="space-between">
            <Text fz="sm" fw={600} truncate title={data.label}>
                {data.label}
            </Text>
            {data.isBase ? (
                <Badge size="xs" variant="light" flex="none">
                    Base
                </Badge>
            ) : data.isHidden ? (
                <Badge size="xs" variant="default" flex="none">
                    Hidden
                </Badge>
            ) : null}
        </Group>
        <Text fz="xs" c="dimmed" ff="monospace" truncate title={data.id}>
            {data.modelName ? `${data.id} (${data.modelName})` : data.id}
        </Text>
        {data.keys ? (
            <Tooltip
                label={data.keys}
                multiline
                maw={360}
                openDelay={300}
                withinPortal
            >
                <Text fz="xs" ff="monospace" truncate>
                    {data.joinType ? `${data.joinType} on ` : 'on '}
                    {data.keys}
                </Text>
            </Tooltip>
        ) : null}
        <Handle
            type="source"
            position={Position.Right}
            className={classes.handle}
            isConnectable={false}
        />
    </Paper>
);

const JoinEdge: FC<EdgeProps<JoinFlowEdge>> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
}) => {
    const [path, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    });
    const relationship = data?.relationship ?? null;
    const cardinality = cardinalityOf(relationship);
    const fanOut = isFanOut(relationship);
    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                className={clsx(fanOut && classes.fanOutEdge)}
            />
            <EdgeLabelRenderer>
                {cardinality ? (
                    <>
                        <Box
                            component="span"
                            className={classes.sourceCardinality}
                            style={{
                                '--x': `${sourceX}px`,
                                '--y': `${sourceY}px`,
                            }}
                        >
                            {cardinality[0]}
                        </Box>
                        <Box
                            component="span"
                            className={classes.targetCardinality}
                            style={{
                                '--x': `${targetX}px`,
                                '--y': `${targetY}px`,
                            }}
                        >
                            {cardinality[1]}
                        </Box>
                    </>
                ) : null}
                <Tooltip
                    label={
                        fanOut
                            ? 'Each row can match many joined rows, so metrics from the left table can be repeated.'
                            : relationship
                              ? `${relationship}`
                              : 'No relationship set on this join'
                    }
                    multiline
                    maw={280}
                    withinPortal
                >
                    <Badge
                        size="xs"
                        variant={fanOut ? 'light' : 'default'}
                        color={fanOut ? 'orange' : undefined}
                        className={classes.edgeLabel}
                        style={{ '--x': `${labelX}px`, '--y': `${labelY}px` }}
                    >
                        {relationship ?? 'relationship not set'}
                    </Badge>
                </Tooltip>
            </EdgeLabelRenderer>
        </>
    );
};

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { join: JoinEdge };

// Wide graphs open readable and pan, rather than shrinking to fit.
const FIT_VIEW_OPTIONS = { padding: 0.15, minZoom: 0.6, maxZoom: 1 };

export const JoinDiagram: FC<{ projectUuid: string; exploreName: string }> = ({
    projectUuid,
    exploreName,
}) => {
    const { data: explore, isInitialLoading } = useExploreByProjectUuid(
        exploreName,
        projectUuid,
    );
    const flow = useMemo(() => {
        if (!explore) return null;
        const graph = toJoinGraph(explore);
        const positions = layoutJoinGraph(graph);
        const nodes = graph.tables.map<TableFlowNode>((table) => ({
            id: table.id,
            type: 'table',
            position: positions.get(table.id) ?? { x: 0, y: 0 },
            data: table,
        }));
        const edges = graph.links.map<JoinFlowEdge>((link) => ({
            id: link.id,
            source: link.source,
            target: link.target,
            type: 'join',
            data: link,
        }));
        return { nodes, edges, joinCount: graph.links.length };
    }, [explore]);

    if (isInitialLoading) {
        return (
            <Group justify="center" py="xl">
                <Loader size="sm" />
            </Group>
        );
    }
    if (!flow) return null;
    return (
        <Box className={classes.root}>
            <Text fz="xs" c="dimmed">
                {flow.joinCount === 0
                    ? 'This explore has no joins: every field comes from its base table.'
                    : `${flow.joinCount} ${flow.joinCount === 1 ? 'table is' : 'tables are'} joined to the base table. Joins marked one-to-many or many-to-many can repeat rows from the table on their left.`}
            </Text>
            <Paper withBorder className={classes.canvas}>
                <ReactFlowProvider>
                    <ReactFlow<TableFlowNode, JoinFlowEdge>
                        className={reactFlowStyles.reactFlow}
                        nodes={flow.nodes}
                        edges={flow.edges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        fitView
                        fitViewOptions={FIT_VIEW_OPTIONS}
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

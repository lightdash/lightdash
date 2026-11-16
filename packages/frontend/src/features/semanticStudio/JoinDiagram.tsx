/**
 * A read-only diagram of an explore's base table and the tables joined to it,
 * drawn like the composer's lineage graph. Clicking a table shows its full join.
 */
import { JoinRelationship } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Code,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
} from '@mantine/core';
import { IconTable, IconX } from '@tabler/icons-react';
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
    Panel,
} from '@xyflow/react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import '@xyflow/react/dist/style.css';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import MantineIcon from '../../components/common/MantineIcon';
import DefaultEdge from '../../components/common/ReactFlow/DefaultEdge';
import reactFlowStyles from '../../components/common/ReactFlow/reactFlow.module.css';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import classes from './JoinDiagram.module.css';
import {
    isFanOut,
    JOIN_NODE_HEIGHT,
    JOIN_NODE_WIDTH,
    layoutJoinGraph,
    pathToBase,
    toJoinGraph,
    type JoinTableNode,
} from './joinGraph';

type TableNodeData = JoinTableNode & {
    /** Another table is selected and this one is off its path to the base. */
    isDimmed: boolean;
    isSelected: boolean;
};

type TableFlowNode = Node<TableNodeData, 'table'>;

/** Global so the stylesheet can target them; edges take no CSS module class. */
const EDGE_ACTIVE_CLASS = 'join-edge-active';
const edgeRelationshipClass = (table: JoinTableNode) =>
    `join-edge-${table.relationship ?? 'unset'}`;

/** Each relationship's colour, in the order the legend lists them. */
const RELATIONSHIPS = [
    { key: JoinRelationship.MANY_TO_ONE, label: 'many-to-one' },
    { key: JoinRelationship.ONE_TO_ONE, label: 'one-to-one' },
    {
        key: JoinRelationship.ONE_TO_MANY,
        label: 'one-to-many, can repeat rows',
    },
    {
        key: JoinRelationship.MANY_TO_MANY,
        label: 'many-to-many, can repeat rows',
    },
    { key: 'unset', label: 'not set' },
] as const;

const RelationshipLegend: FC<{ present: ReadonlySet<string> }> = ({
    present,
}) => (
    <Panel position="bottom-right" className={classes.legend}>
        {RELATIONSHIPS.filter(({ key }) => present.has(key)).map(
            ({ key, label }) => (
                <Group key={key} gap={6} wrap="nowrap">
                    <Box
                        component="span"
                        className={classes.legendLine}
                        data-relationship={key}
                    />
                    <Text component="span" fz="xs" c="dimmed">
                        {label}
                    </Text>
                </Group>
            ),
        )}
    </Panel>
);

const RelationshipText: FC<{ table: JoinTableNode }> = ({ table }) =>
    table.relationship ? (
        <Text
            component="span"
            fz="xs"
            className={classes.relationship}
            data-relationship={table.relationship}
        >
            {table.relationship}
        </Text>
    ) : (
        <Text component="span" fz="xs" c="dimmed" fs="italic">
            relationship not set
        </Text>
    );

const TableNode: FC<NodeProps<TableFlowNode>> = ({ data }) => (
    <Paper
        component="button"
        type="button"
        w={JOIN_NODE_WIDTH}
        h={JOIN_NODE_HEIGHT}
        className={classes.node}
        data-base={data.isBase}
        data-dimmed={data.isDimmed}
        data-selected={data.isSelected}
        aria-pressed={data.isSelected}
        aria-label={`Show how ${data.label} is joined`}
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
                    {data.label}
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
        <Group
            gap="xs"
            wrap="nowrap"
            justify="space-between"
            className={classes.nodeFooter}
        >
            {data.isBase ? (
                <Text component="span" fz="xs" c="dimmed">
                    Base table
                </Text>
            ) : (
                <>
                    <Text
                        component="span"
                        fz="xs"
                        c="dimmed"
                        ff="monospace"
                        truncate
                    >
                        {data.keyColumns.length > 0
                            ? `on ${data.keyColumns.join(', ')}`
                            : 'custom condition'}
                    </Text>
                    {data.isHidden ? (
                        <Badge size="xs" variant="default" flex="none">
                            Hidden
                        </Badge>
                    ) : null}
                </>
            )}
        </Group>
        <Handle
            type="source"
            position={Position.Right}
            className={classes.handle}
        />
    </Paper>
);

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { join: DefaultEdge };

// Centred; never larger than 100%, and wide graphs stay readable and pan.
const FIT_VIEW_OPTIONS = { padding: 0.15, minZoom: 0.6, maxZoom: 1 };

const Fact: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Box>
        <Text fz="xs" c="dimmed" mb={2}>
            {label}
        </Text>
        {children}
    </Box>
);

/** Everything a node truncates: the table, what it joins to and its full condition. */
const JoinDetails: FC<{
    table: JoinTableNode;
    parent: JoinTableNode | undefined;
    joinCount: number;
    onClose: () => void;
}> = ({ table, parent, joinCount, onClose }) => (
    <Paper withBorder shadow="sm" className={classes.details}>
        <Group gap="xs" wrap="nowrap" align="flex-start">
            <Box className={classes.nodeIcon}>
                <MantineIcon icon={IconTable} size={14} />
            </Box>
            <Box miw={0} flex={1}>
                <Text fz="sm" fw={500} className={classes.wrap}>
                    {table.label}
                </Text>
                <Text
                    fz="xs"
                    c="dimmed"
                    ff="monospace"
                    className={classes.wrap}
                >
                    {table.id}
                    {table.modelName ? ` · model ${table.modelName}` : ''}
                </Text>
            </Box>
            <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={onClose}
                aria-label="Close join details"
            >
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Group>
        {table.description ? (
            <Text fz="xs" c="dimmed" className={classes.wrap}>
                {table.description}
            </Text>
        ) : null}
        {table.isBase ? (
            <Text fz="xs">
                {joinCount === 0
                    ? 'The base table of this explore. Nothing is joined to it.'
                    : `The base table of this explore. ${joinCount} ${joinCount === 1 ? 'table is' : 'tables are'} joined from here.`}
            </Text>
        ) : (
            <Stack gap="sm">
                <Fact label="Joined to">
                    <Text fz="xs" className={classes.wrap}>
                        {parent?.label ?? table.parent}
                    </Text>
                </Fact>
                <Fact label="Relationship">
                    <RelationshipText table={table} />
                    {isFanOut(table.relationship) ? (
                        <Text fz="xs" c="dimmed">
                            Each {parent?.label ?? 'row'} row can match many
                            rows here, so its metrics can repeat.
                        </Text>
                    ) : null}
                </Fact>
                <Fact label="Join type">
                    <Text fz="xs">{table.joinType ?? 'left (default)'}</Text>
                </Fact>
                {table.isHidden ? (
                    <Fact label="Visibility">
                        <Text fz="xs">Hidden from the Explore sidebar</Text>
                    </Fact>
                ) : null}
                <Box>
                    <Group justify="space-between" wrap="nowrap" mb={4}>
                        <Text fz="xs" c="dimmed">
                            Condition
                        </Text>
                        <CopyActionIcon
                            value={table.keys ?? ''}
                            copyLabel="Copy condition"
                        />
                    </Group>
                    <Code block className={classes.condition}>
                        {table.keys}
                    </Code>
                </Box>
            </Stack>
        )}
    </Paper>
);

export const JoinDiagram: FC<{ projectUuid: string; exploreName: string }> = ({
    projectUuid,
    exploreName,
}) => {
    const { data: explore, isInitialLoading } = useExploreByProjectUuid(
        exploreName,
        projectUuid,
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const graph = useMemo(
        () => (explore ? toJoinGraph(explore) : null),
        [explore],
    );
    const positions = useMemo(
        () => (graph ? layoutJoinGraph(graph) : null),
        [graph],
    );
    const flow = useMemo(() => {
        if (!graph || !positions) return null;
        const path = selectedId ? pathToBase(graph.tables, selectedId) : null;
        const nodes = graph.tables.map<TableFlowNode>((table) => ({
            id: table.id,
            type: 'table',
            position: positions.get(table.id) ?? { x: 0, y: 0 },
            data: {
                ...table,
                isDimmed: path !== null && !path.has(table.id),
                isSelected: table.id === selectedId,
            },
        }));
        const tableById = new Map(graph.tables.map((t) => [t.id, t]));
        const edges = graph.links.map<Edge>((link) => {
            const target = tableById.get(link.target);
            return {
                id: link.id,
                source: link.source,
                target: link.target,
                type: 'join',
                className: clsx(
                    target && edgeRelationshipClass(target),
                    path?.has(link.source) &&
                        path.has(link.target) &&
                        EDGE_ACTIVE_CLASS,
                ),
            };
        });
        const present = new Set(
            graph.tables
                .filter(({ isBase }) => !isBase)
                .map(({ relationship }) => relationship ?? 'unset'),
        );
        return { nodes, edges, present };
    }, [graph, positions, selectedId]);

    if (isInitialLoading) {
        return (
            <Group justify="center" py="xl">
                <Loader size="sm" />
            </Group>
        );
    }
    if (!graph || !flow) return null;
    const joinCount = graph.links.length;
    const selected = graph.tables.find(({ id }) => id === selectedId);
    return (
        <Box className={classes.root}>
            <Paper withBorder className={classes.canvas}>
                <ReactFlowProvider>
                    <ReactFlow<TableFlowNode, Edge>
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
                        {flow.present.size > 0 ? (
                            <RelationshipLegend present={flow.present} />
                        ) : null}
                    </ReactFlow>
                </ReactFlowProvider>
                {selected ? (
                    <JoinDetails
                        table={selected}
                        parent={graph.tables.find(
                            ({ id }) => id === selected.parent,
                        )}
                        joinCount={joinCount}
                        onClose={() => setSelectedId(null)}
                    />
                ) : null}
            </Paper>
        </Box>
    );
};

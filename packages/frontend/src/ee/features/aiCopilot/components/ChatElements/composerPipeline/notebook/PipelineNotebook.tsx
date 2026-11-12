import { type SourceQuery } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Collapse,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChevronRight,
    IconHash,
    IconMessagePlus,
    IconTelescope,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import {
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
    type Ref,
} from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../../providers/Embed/useUiStrings';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import { useComposerNodeRowsLabel } from '../../composerNodeStatus';
import { NodeStatusIndicator } from '../../ComposerNodeStatusIndicator';
import { type ComposerRunNodeStatus } from '../../useComposerRunNodeStatuses';
import { ComposerNodeIcon } from '../ComposerNodeIcon';
import { type NodeLineage, type PipelineNode } from '../groupPipeline';
import { MergeStepBody, MergeStepTitle } from '../MergeStep';
import { MergeStepProvider } from '../MergeStepParts';
import { NodeReferencePill } from '../NodeReferencePill';
import { useComposerNodeTypeLabel } from '../useComposerNodeLiveSource';
import {
    CellQueryPanels,
    CellQueryToggles,
    ExploreSource,
    MergeCellToggles,
} from './NodeQuery';
import styles from './PipelineNotebook.module.css';
import {
    hasQueryDetails,
    semanticQueryOf,
    type QueryPanel,
} from './semanticQueryOf';
import { useExploreFromHere } from './useExploreFromHere';
import { useMergeNodeView } from './useMergeNodeView';

const FLASH_MS = 1200;
const CELL_SCROLL_GAP = 16;

const formatDuration = (ms: number) =>
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

export type PipelineNotebookHandle = {
    /** Scrolls to a node's cell and flashes it. */
    focusNode: (nodeId: string) => void;
    /** Draws the lines between a node's cell and the cells it reads or feeds. */
    showLineage: (nodeId: string) => void;
    hideLineage: () => void;
};

export type PipelineNotebookProps = {
    ref?: Ref<PipelineNotebookHandle>;
    nodes: PipelineNode[];
    projectUuid: string;
    /** By node id; a node without an entry shows no status. */
    nodeStatuses: Readonly<Record<string, ComposerRunNodeStatus>>;
    /** Nodes with a result in the current run. */
    displayableNodeIds: ReadonlySet<string>;
    renderNodeResult: (nodeId: string) => ReactNode;
    /** Nodes already attached to the chat input. */
    chatNodeIds: ReadonlySet<string>;
    /** Null when the pipeline can't be pinned to a chat. */
    onAddToChat: ((node: PipelineNode) => void) | null;
    /** Selects the node in the lineage graph. */
    onSelectNode: (nodeId: string) => void;
    /** The lineage drawn in the notebook. */
    onLineageChange: (lineage: NodeLineage | null) => void;
    /** Scrolled to with its results open once the run has its result. */
    initialFocusNodeId: string | null;
};

const CellStatus: FC<{
    query: SourceQuery;
    status: ComposerRunNodeStatus | undefined;
}> = ({ query, status }) => {
    const typeLabel = useComposerNodeTypeLabel(query);
    return (
        <Tooltip label={typeLabel}>
            <Box className={styles.cellIcon}>
                {status && status.status !== 'success' ? (
                    <NodeStatusIndicator status={status.status} />
                ) : (
                    <ComposerNodeIcon query={query} size={14} />
                )}
            </Box>
        </Tooltip>
    );
};

type CellProps = Omit<
    PipelineNotebookProps,
    | 'ref'
    | 'nodes'
    | 'chatNodeIds'
    | 'onSelectNode'
    | 'onLineageChange'
    | 'initialFocusNodeId'
> & {
    node: PipelineNode;
    resultsInitiallyOpen: boolean;
    /** The nodes this one reads. */
    references: PipelineNode[];
    inChat: boolean;
    flashing: boolean;
    onJump: (nodeId: string) => void;
    onLineageHover: (hovering: boolean) => void;
    /** Highlights one step this cell reads in the graph; null clears it. */
    onHighlightNode: (nodeId: string | null) => void;
};

const NotebookCell: FC<CellProps> = ({
    node,
    references,
    projectUuid,
    nodeStatuses,
    displayableNodeIds,
    renderNodeResult,
    inChat,
    onAddToChat,
    flashing,
    onJump,
    onLineageHover,
    onHighlightNode,
    resultsInitiallyOpen,
}) => {
    const getUiString = useUiStrings();
    const rowsLabel = useComposerNodeRowsLabel();
    const canViewSql = useCanViewAiAgentSql();
    const exploreFromHere = useExploreFromHere(projectUuid);
    const [resultsOpen, setResultsOpen] = useState(resultsInitiallyOpen);
    const status = nodeStatuses[node.nodeId];
    const semanticQuery = semanticQueryOf(node.query);
    const mergeView = useMergeNodeView(node.query, references, projectUuid);
    const hasResult =
        displayableNodeIds.has(node.nodeId) &&
        (status === undefined || status.status === 'success');
    const waiting =
        status?.status === 'pending' || status?.status === 'running';
    const facts =
        status?.status === 'success'
            ? [
                  status.totalRowCount === null
                      ? null
                      : rowsLabel(node.query, status.totalRowCount),
                  status.durationMs === null
                      ? null
                      : formatDuration(status.durationMs),
              ].filter((fact): fact is string => fact !== null)
            : [];
    const exploreLabel = getUiString('aiAgent.composer.node.exploreFromHere');
    const addToChatLabel = getUiString('aiAgent.composer.node.addToChat');
    const summary = waiting
        ? getUiString(
              status.status === 'running'
                  ? 'aiAgent.composer.node.running'
                  : 'aiAgent.composer.node.queued',
          )
        : facts.join(' · ') || null;
    const [openPanels, setOpenPanels] = useState<ReadonlySet<QueryPanel>>(
        () =>
            new Set(
                mergeView || (semanticQuery && hasQueryDetails(semanticQuery))
                    ? ['details']
                    : [],
            ),
    );
    const togglePanel = (panel: QueryPanel) =>
        setOpenPanels((current) => {
            const next = new Set(current);
            if (!next.delete(panel)) next.add(panel);
            return next;
        });
    const hasError = status?.status === 'error' && !!status.error;

    return (
        <Stack gap="xs" className={styles.cell} data-node-id={node.nodeId}>
            <Group
                gap="xs"
                wrap="nowrap"
                align="flex-start"
                onMouseEnter={() => onLineageHover(true)}
                onMouseLeave={() => onLineageHover(false)}
            >
                <CellStatus query={node.query} status={status} />
                <Stack gap="xxs" flex={1} miw={0}>
                    <Group gap="xs" wrap="nowrap" miw={0}>
                        <Text fz="sm" fw={500} truncate>
                            {node.title}
                        </Text>
                        {node.isTerminal && (
                            <Badge size="xs" flex="0 0 auto">
                                {getUiString(
                                    'aiAgent.composer.node.finalResult',
                                )}
                            </Badge>
                        )}
                    </Group>
                    {node.description && (
                        <Text fz="xs" c="dimmed" lineClamp={2}>
                            {node.description}
                        </Text>
                    )}
                </Stack>
                <Group gap="xxs" wrap="nowrap" className={styles.cellActions}>
                    {onAddToChat && !inChat && (
                        <Button
                            size="compact-xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconMessagePlus} size={14} />
                            }
                            onClick={() => onAddToChat(node)}
                        >
                            {addToChatLabel}
                        </Button>
                    )}
                    {semanticQuery && exploreFromHere && (
                        <Tooltip label={exploreLabel}>
                            <ActionIcon
                                size="sm"
                                aria-label={exploreLabel}
                                onClick={() =>
                                    void exploreFromHere(semanticQuery)
                                }
                            >
                                <MantineIcon icon={IconTelescope} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </Group>
            <Stack gap="xs">
                <Box
                    className={styles.cellFrame}
                    data-flash={flashing}
                    data-empty={
                        !semanticQuery &&
                        !mergeView &&
                        !canViewSql &&
                        !hasError &&
                        !hasResult &&
                        !summary
                    }
                >
                    {semanticQuery && (
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            className={styles.toolbar}
                        >
                            <ExploreSource
                                query={semanticQuery}
                                projectUuid={projectUuid}
                            />
                            <CellQueryToggles
                                query={semanticQuery}
                                canViewSql={canViewSql}
                                openPanels={openPanels}
                                onTogglePanel={togglePanel}
                            />
                        </Group>
                    )}
                    {mergeView && (
                        <MergeStepProvider
                            view={mergeView}
                            references={references}
                            onJump={onJump}
                            onHighlightNode={onHighlightNode}
                        >
                            <Group
                                justify="space-between"
                                wrap="nowrap"
                                className={styles.toolbar}
                            >
                                <MergeStepTitle view={mergeView} />
                                <MergeCellToggles
                                    openPanels={openPanels}
                                    onTogglePanel={togglePanel}
                                />
                            </Group>
                            <Collapse expanded={openPanels.has('details')}>
                                <Box className={styles.panel}>
                                    <MergeStepBody view={mergeView} />
                                </Box>
                            </Collapse>
                        </MergeStepProvider>
                    )}
                    <CellQueryPanels
                        query={node.query}
                        projectUuid={projectUuid}
                        canViewSql={canViewSql}
                        openPanels={openPanels}
                    />
                    {hasError && (
                        <Box className={styles.cellError}>{status.error}</Box>
                    )}
                    {hasResult ? (
                        <UnstyledButton
                            className={styles.resultsToggle}
                            aria-expanded={resultsOpen}
                            onClick={() => setResultsOpen(!resultsOpen)}
                        >
                            <MantineIcon
                                icon={IconChevronRight}
                                size={12}
                                className={clsx(
                                    styles.chevron,
                                    resultsOpen && styles.chevronOpen,
                                )}
                            />
                            <Text
                                component="span"
                                fz="xs"
                                c="dimmed"
                                className={styles.facts}
                            >
                                {summary ??
                                    getUiString(
                                        'aiAgent.composer.node.viewResults',
                                    )}
                            </Text>
                        </UnstyledButton>
                    ) : (
                        summary && (
                            <Box className={styles.footer}>
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    className={styles.facts}
                                >
                                    {summary}
                                </Text>
                            </Box>
                        )
                    )}
                    {hasResult && resultsOpen && (
                        <Box className={styles.result}>
                            {renderNodeResult(node.nodeId)}
                        </Box>
                    )}
                </Box>
                {references.length > 0 && !mergeView && (
                    <Group gap="xs" pl="xxs">
                        <MantineIcon
                            icon={IconHash}
                            size={13}
                            className={styles.referencesIcon}
                        />
                        <Text component="span" fz="xs" c="dimmed">
                            {getUiString('aiAgent.composer.node.references')}
                        </Text>
                        {references.map((reference) => (
                            <NodeReferencePill
                                key={reference.nodeId}
                                node={reference}
                                leading={
                                    <ComposerNodeIcon
                                        query={reference.query}
                                        size={12}
                                    />
                                }
                                onJump={onJump}
                                onHighlight={onLineageHover}
                                details={null}
                                active={false}
                                trailing={null}
                            />
                        ))}
                    </Group>
                )}
            </Stack>
        </Stack>
    );
};

const CELL_ANCHOR_Y = 12;
const TRUNK_INSET = 14;
const CORNER = 10;

/** The branch into one cell: an elbow at the trunk's ends, a straight stub between. */
const branchPath = (
    y: number,
    top: number,
    bottom: number,
    trunkX: number,
    endX: number,
) => {
    if (y === top)
        return `M ${trunkX} ${top + CORNER} Q ${trunkX} ${top} ${trunkX + CORNER} ${top} H ${endX}`;
    if (y === bottom)
        return `M ${trunkX} ${bottom - CORNER} Q ${trunkX} ${bottom} ${trunkX + CORNER} ${bottom} H ${endX}`;
    return `M ${trunkX} ${y} H ${endX}`;
};

/** A trunk in the gutter with a branch into each cell. */
const lineagePath = (ys: number[], trunkX: number, endX: number) => {
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return [
        `M ${trunkX} ${top + CORNER} V ${bottom - CORNER}`,
        ...ys.map((y) => branchPath(y, top, bottom, trunkX, endX)),
    ].join(' ');
};

type Lineage = NodeLineage & { d: string };

// Skips cells the pointer only sweeps across.
const HOVER_INTENT_MS = 150;

/** Pipeline order, one cell per node: its query, then its rows; hovering a cell draws its lineage. */
export const PipelineNotebook: FC<PipelineNotebookProps> = ({
    ref,
    nodes,
    chatNodeIds,
    onSelectNode,
    onLineageChange,
    initialFocusNodeId,
    ...cellProps
}) => {
    const notebookEl = useRef<HTMLDivElement>(null);
    const cellEls = useRef(new Map<string, HTMLDivElement>());
    const [flashNodeId, setFlashNodeId] = useState<string | null>(null);
    const [lineage, setLineage] = useState<Lineage | null>(null);
    // Kept drawn while hidden so the lines fade out instead of vanishing.
    const [isLineageVisible, setIsLineageVisible] = useState(false);
    const intentTimer = useRef<number | undefined>(undefined);
    const nodesById = useMemo(
        () => new Map(nodes.map((node) => [node.nodeId, node])),
        [nodes],
    );
    const hideLineage = () => {
        window.clearTimeout(intentTimer.current);
        setIsLineageVisible(false);
        onLineageChange(null);
    };
    const focusNode = (nodeId: string) => {
        onSelectNode(nodeId);
        // Lines drawn before the scroll would leave a hook pointing off-screen.
        hideLineage();
        const cell = cellEls.current.get(nodeId);
        // Scrolls only the notebook; scrollIntoView would also nudge the page.
        if (cell) {
            notebookEl.current?.scrollTo({
                top: cell.offsetTop - CELL_SCROLL_GAP,
                behavior: 'smooth',
            });
        }
        setFlashNodeId(nodeId);
        window.setTimeout(
            () =>
                setFlashNodeId((current) =>
                    current === nodeId ? null : current,
                ),
            FLASH_MS,
        );
    };
    // Measured on hover: cells grow as panels and rows open.
    const drawLineage = (nodeId: string) => {
        const node = nodesById.get(nodeId);
        const hovered = cellEls.current.get(nodeId);
        if (!node || !hovered) return;
        const related = [
            ...node.readNodeIds,
            ...nodes
                .filter((other) => other.readNodeIds.includes(node.nodeId))
                .map((other) => other.nodeId),
        ];
        const y = (el: HTMLElement) => el.offsetTop + CELL_ANCHOR_Y;
        const endX = hovered.offsetLeft - 4;
        const trunkX = endX - TRUNK_INSET;
        const relatedYs = related.flatMap((id) => {
            const el = cellEls.current.get(id);
            return el ? [y(el)] : [];
        });
        if (relatedYs.length === 0) return;
        const nodeLineage = { nodeId, relatedIds: new Set(related) };
        setLineage({
            ...nodeLineage,
            d: lineagePath([...relatedYs, y(hovered)], trunkX, endX),
        });
        setIsLineageVisible(true);
        onLineageChange(nodeLineage);
    };
    const highlightNode = (nodeId: string | null, fromNodeId: string) => {
        hideLineage();
        if (nodeId) {
            onLineageChange({ nodeId, relatedIds: new Set([fromNodeId]) });
        }
    };
    const showLineage = (nodeId: string) => {
        window.clearTimeout(intentTimer.current);
        intentTimer.current = window.setTimeout(
            () => drawLineage(nodeId),
            HOVER_INTENT_MS,
        );
    };
    useEffect(() => () => window.clearTimeout(intentTimer.current), []);

    const hasFocusedInitialNode = useRef(false);
    useEffect(() => {
        if (
            hasFocusedInitialNode.current ||
            initialFocusNodeId === null ||
            !cellProps.displayableNodeIds.has(initialFocusNodeId)
        ) {
            return;
        }
        hasFocusedInitialNode.current = true;
        focusNode(initialFocusNodeId);
    });

    useImperativeHandle(ref, () => ({ focusNode, showLineage, hideLineage }));

    return (
        <Stack
            gap="lg"
            className={styles.notebook}
            ref={notebookEl}
            data-focus-room={initialFocusNodeId !== null}
        >
            <svg
                className={styles.lineage}
                data-lineage
                data-visible={isLineageVisible}
                aria-hidden
            >
                {lineage && <path d={lineage.d} />}
            </svg>
            {nodes.map((node) => (
                <Box
                    key={node.nodeId}
                    ref={(el: HTMLDivElement | null) => {
                        if (el) cellEls.current.set(node.nodeId, el);
                        else cellEls.current.delete(node.nodeId);
                    }}
                    onClick={() => onSelectNode(node.nodeId)}
                    data-lineage-role={
                        !isLineageVisible || !lineage
                            ? undefined
                            : lineage.nodeId === node.nodeId
                              ? 'hovered'
                              : lineage.relatedIds.has(node.nodeId)
                                ? 'related'
                                : undefined
                    }
                >
                    <NotebookCell
                        node={node}
                        references={node.readNodeIds.flatMap((readId) => {
                            const reference = nodesById.get(readId);
                            return reference ? [reference] : [];
                        })}
                        inChat={chatNodeIds.has(node.nodeId)}
                        flashing={flashNodeId === node.nodeId}
                        resultsInitiallyOpen={
                            node.nodeId === initialFocusNodeId
                        }
                        onJump={focusNode}
                        onLineageHover={(hovering) =>
                            hovering ? showLineage(node.nodeId) : hideLineage()
                        }
                        onHighlightNode={(nodeId) =>
                            highlightNode(nodeId, node.nodeId)
                        }
                        {...cellProps}
                    />
                </Box>
            ))}
        </Stack>
    );
};

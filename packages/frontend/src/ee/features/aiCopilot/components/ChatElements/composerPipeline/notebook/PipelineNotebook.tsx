import { interpolateUiString, type SourceQuery } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useInViewport } from '@mantine/hooks';
import {
    IconChevronRight,
    IconHash,
    IconMessagePlus,
    IconTelescope,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../../providers/Embed/useUiStrings';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import { NodeStatusIndicator } from '../../ComposerNodeStatusIndicator';
import { type ComposerRunNodeStatus } from '../../useComposerRunNodeStatuses';
import { nodeTypeLabelOf, type PipelineNode } from '../groupPipeline';
import { nodeTypeIcon } from '../nodeTypeIcon';
import { CellQueryPanels, CellQueryToggles, ExploreSource } from './NodeQuery';
import styles from './PipelineNotebook.module.css';
import { semanticQueryOf, type QueryPanel } from './semanticQueryOf';
import { useExploreFromHere } from './useExploreFromHere';

const FLASH_MS = 1200;

const formatDuration = (ms: number) =>
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

export type PipelineNotebookProps = {
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
};

// Results are a fetch per node, so a cell loads its own once scrolled into view.
const useSeenInViewport = () => {
    const { ref, inViewport } = useInViewport();
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        if (inViewport) setSeen(true);
    }, [inViewport]);
    return { ref, seen };
};

const CellStatus: FC<{
    query: SourceQuery;
    status: ComposerRunNodeStatus | undefined;
}> = ({ query, status }) => (
    <Tooltip label={nodeTypeLabelOf(query)}>
        <Box className={styles.cellIcon}>
            {status && status.status !== 'success' ? (
                <NodeStatusIndicator status={status.status} />
            ) : (
                <MantineIcon
                    icon={nodeTypeIcon(query)}
                    size={14}
                    stroke={1.5}
                    aria-hidden
                />
            )}
        </Box>
    </Tooltip>
);

type CellProps = Omit<PipelineNotebookProps, 'nodes' | 'chatNodeIds'> & {
    node: PipelineNode;
    /** The nodes this one reads. */
    references: PipelineNode[];
    inChat: boolean;
    flashing: boolean;
    open: boolean;
    onToggle: () => void;
    onJump: (nodeId: string) => void;
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
    open,
    onToggle,
    onJump,
}) => {
    const getUiString = useUiStrings();
    const canViewSql = useCanViewAiAgentSql();
    const exploreFromHere = useExploreFromHere(projectUuid);
    const { ref: cellRef, seen } = useSeenInViewport();
    const status = nodeStatuses[node.nodeId];
    const semanticQuery = semanticQueryOf(node.query);
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
                      : interpolateUiString(
                            getUiString(
                                status.totalRowCount === 1
                                    ? 'aiAgent.composer.semanticNode.rows.singular'
                                    : 'aiAgent.composer.semanticNode.rows.plural',
                            ),
                            { count: status.totalRowCount.toLocaleString() },
                        ),
                  status.durationMs === null
                      ? null
                      : formatDuration(status.durationMs),
              ].filter((fact): fact is string => fact !== null)
            : [];
    const exploreLabel = getUiString('aiAgent.composer.node.exploreFromHere');
    const addToChatLabel = getUiString('aiAgent.composer.node.addToChat');
    const toggleLabel = getUiString(
        open
            ? 'aiAgent.composer.node.collapse'
            : 'aiAgent.composer.node.expand',
    );
    const summary = waiting
        ? getUiString(
              status.status === 'running'
                  ? 'aiAgent.composer.node.running'
                  : 'aiAgent.composer.node.queued',
          )
        : facts.join(' · ') || null;
    const [openPanels, setOpenPanels] = useState<ReadonlySet<QueryPanel>>(
        () => new Set(),
    );
    const togglePanel = (panel: QueryPanel) =>
        setOpenPanels((current) => {
            const next = new Set(current);
            if (!next.delete(panel)) next.add(panel);
            return next;
        });
    const hasError = status?.status === 'error' && !!status.error;

    return (
        <Stack
            ref={cellRef}
            gap="xs"
            className={styles.cell}
            data-node-id={node.nodeId}
        >
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <Tooltip label={toggleLabel}>
                    <ActionIcon
                        size="sm"
                        className={styles.cellToggle}
                        aria-label={toggleLabel}
                        aria-expanded={open}
                        onClick={onToggle}
                    >
                        <MantineIcon
                            icon={IconChevronRight}
                            size={12}
                            className={clsx(
                                styles.chevron,
                                open && styles.chevronOpen,
                            )}
                        />
                    </ActionIcon>
                </Tooltip>
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
                        <Tooltip label={addToChatLabel}>
                            <ActionIcon
                                size="sm"
                                aria-label={addToChatLabel}
                                onClick={() => onAddToChat(node)}
                            >
                                <MantineIcon icon={IconMessagePlus} />
                            </ActionIcon>
                        </Tooltip>
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
            <Collapse expanded={open}>
                <Stack gap="xs">
                    <Box
                        className={styles.cellFrame}
                        data-flash={flashing}
                        data-empty={
                            !semanticQuery &&
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
                                <Group gap="xs" wrap="nowrap" miw={0}>
                                    <ExploreSource
                                        query={semanticQuery}
                                        projectUuid={projectUuid}
                                    />
                                    {summary && (
                                        <Text
                                            fz="xs"
                                            c="dimmed"
                                            className={styles.facts}
                                        >
                                            {summary}
                                        </Text>
                                    )}
                                </Group>
                                <CellQueryToggles
                                    query={semanticQuery}
                                    canViewSql={canViewSql}
                                    openPanels={openPanels}
                                    onTogglePanel={togglePanel}
                                />
                            </Group>
                        )}
                        <CellQueryPanels
                            query={node.query}
                            projectUuid={projectUuid}
                            canViewSql={canViewSql}
                            openPanels={openPanels}
                        />
                        {hasError && (
                            <Box className={styles.cellError}>
                                {status.error}
                            </Box>
                        )}
                        {hasResult && open && (
                            <Box className={styles.result}>
                                {seen && renderNodeResult(node.nodeId)}
                            </Box>
                        )}
                        {!semanticQuery && summary && (
                            <Box className={styles.footer}>
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    className={styles.facts}
                                >
                                    {summary}
                                </Text>
                            </Box>
                        )}
                    </Box>
                    {references.length > 0 && (
                        <Group gap="xs" pl="xxs">
                            <MantineIcon
                                icon={IconHash}
                                size={13}
                                className={styles.referencesIcon}
                            />
                            <Text component="span" fz="xs" c="dimmed">
                                {getUiString(
                                    'aiAgent.composer.node.references',
                                )}
                            </Text>
                            {references.map((reference) => (
                                <UnstyledButton
                                    key={reference.nodeId}
                                    className={styles.referencePill}
                                    onClick={() => onJump(reference.nodeId)}
                                >
                                    <MantineIcon
                                        icon={nodeTypeIcon(reference.query)}
                                        size={12}
                                        stroke={1.5}
                                    />
                                    {reference.title}
                                </UnstyledButton>
                            ))}
                        </Group>
                    )}
                </Stack>
            </Collapse>
        </Stack>
    );
};

/** Pipeline order, one cell per node: its query, then its rows; each links to the cells it reads. */
export const PipelineNotebook: FC<PipelineNotebookProps> = ({
    nodes,
    chatNodeIds,
    ...cellProps
}) => {
    const cellEls = useRef(new Map<string, HTMLDivElement>());
    const [flashNodeId, setFlashNodeId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const nodesById = useMemo(
        () => new Map(nodes.map((node) => [node.nodeId, node])),
        [nodes],
    );
    const toggle = (nodeId: string) =>
        setCollapsed((current) => {
            const next = new Set(current);
            if (!next.delete(nodeId)) next.add(nodeId);
            return next;
        });
    const jump = (nodeId: string) => {
        setCollapsed((current) => {
            const next = new Set(current);
            next.delete(nodeId);
            return next;
        });
        cellEls.current
            .get(nodeId)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setFlashNodeId(nodeId);
        window.setTimeout(
            () =>
                setFlashNodeId((current) =>
                    current === nodeId ? null : current,
                ),
            FLASH_MS,
        );
    };

    return (
        <Stack gap="lg" className={styles.notebook}>
            {nodes.map((node) => (
                <Box
                    key={node.nodeId}
                    ref={(el: HTMLDivElement | null) => {
                        if (el) cellEls.current.set(node.nodeId, el);
                        else cellEls.current.delete(node.nodeId);
                    }}
                >
                    <NotebookCell
                        node={node}
                        references={node.readNodeIds.flatMap((readId) => {
                            const reference = nodesById.get(readId);
                            return reference ? [reference] : [];
                        })}
                        inChat={chatNodeIds.has(node.nodeId)}
                        flashing={flashNodeId === node.nodeId}
                        open={!collapsed.has(node.nodeId)}
                        onToggle={() => toggle(node.nodeId)}
                        onJump={jump}
                        {...cellProps}
                    />
                </Box>
            ))}
        </Stack>
    );
};

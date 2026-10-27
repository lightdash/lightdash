import { type SourceQuery } from '@lightdash/common';
import {
    ActionIcon,
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
    IconCornerDownRight,
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
import { CompiledSql, CompiledSqlToggle, NodeQuery } from './NodeQuery';
import styles from './PipelineNotebook.module.css';
import { semanticQueryOf } from './semanticQueryOf';
import { useExploreFromHere } from './useExploreFromHere';

const FLASH_MS = 1200;

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
const LazyResult: FC<{ children: ReactNode }> = ({ children }) => {
    const { ref, inViewport } = useInViewport();
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        if (inViewport) setSeen(true);
    }, [inViewport]);
    return (
        <Box ref={ref} className={styles.result}>
            {seen && children}
        </Box>
    );
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
                    stroke={1.6}
                    aria-hidden
                />
            )}
        </Box>
    </Tooltip>
);

type CellProps = Omit<PipelineNotebookProps, 'nodes' | 'chatNodeIds'> & {
    node: PipelineNode;
    readers: PipelineNode[];
    inChat: boolean;
    flashing: boolean;
    open: boolean;
    onToggle: () => void;
    onJump: (nodeId: string) => void;
};

const NotebookCell: FC<CellProps> = ({
    node,
    readers,
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
    const [sqlOpen, setSqlOpen] = useState(false);
    const status = nodeStatuses[node.nodeId];
    const semanticQuery = semanticQueryOf(node.query);
    const showQuery = semanticQuery !== null || canViewSql;
    const hasResult =
        displayableNodeIds.has(node.nodeId) &&
        (status === undefined || status.status === 'success');
    const waiting =
        status?.status === 'pending' || status?.status === 'running';
    const exploreLabel = getUiString('aiAgent.composer.node.exploreFromHere');
    const addToChatLabel = getUiString('aiAgent.composer.node.addToChat');

    return (
        <Stack gap={6} data-node-id={node.nodeId}>
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <ActionIcon
                    size="sm"
                    className={styles.cellToggle}
                    aria-label={getUiString(
                        open
                            ? 'aiAgent.composer.node.collapse'
                            : 'aiAgent.composer.node.expand',
                    )}
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
                <CellStatus query={node.query} status={status} />
                <Text fz="sm" lh="20px" flex={1} miw={0}>
                    <Text span fw={500} inherit>
                        {node.title}
                    </Text>
                    {node.description && (
                        <Text span c="dimmed" inherit>
                            {' · '}
                            {node.description}
                        </Text>
                    )}
                </Text>
                <Group gap={2} wrap="nowrap">
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
                <Stack gap={6}>
                    <Box className={styles.cellFrame} data-flash={flashing}>
                        {showQuery && (
                            <NodeQuery
                                query={node.query}
                                projectUuid={projectUuid}
                            />
                        )}
                        {status?.status === 'error' && status.error && (
                            <Box className={styles.cellError}>
                                {status.error}
                            </Box>
                        )}
                        {waiting && (
                            <Text className={styles.cellFooter}>
                                {getUiString(
                                    status.status === 'running'
                                        ? 'aiAgent.composer.node.running'
                                        : 'aiAgent.composer.node.queued',
                                )}
                            </Text>
                        )}
                        {hasResult && open && (
                            <LazyResult>
                                {renderNodeResult(node.nodeId)}
                            </LazyResult>
                        )}
                        {semanticQuery && canViewSql && (
                            <Box className={styles.cellFooter}>
                                <CompiledSqlToggle
                                    open={sqlOpen}
                                    onToggle={() => setSqlOpen((v) => !v)}
                                />
                            </Box>
                        )}
                        {semanticQuery && canViewSql && sqlOpen && (
                            <Box className={styles.cellSql}>
                                <CompiledSql
                                    query={semanticQuery}
                                    projectUuid={projectUuid}
                                />
                            </Box>
                        )}
                    </Box>
                    {readers.length > 0 && (
                        <Group
                            gap={4}
                            pl={2}
                            aria-label={getUiString(
                                'aiAgent.composer.node.readBy',
                            )}
                        >
                            <MantineIcon
                                icon={IconCornerDownRight}
                                size={14}
                                className={styles.readerIcon}
                            />
                            {readers.map((reader) => (
                                <UnstyledButton
                                    key={reader.nodeId}
                                    className={styles.readerPill}
                                    onClick={() => onJump(reader.nodeId)}
                                >
                                    <MantineIcon
                                        icon={nodeTypeIcon(reader.query)}
                                        size={12}
                                        stroke={1.6}
                                    />
                                    {reader.title}
                                </UnstyledButton>
                            ))}
                        </Group>
                    )}
                </Stack>
            </Collapse>
        </Stack>
    );
};

/** Pipeline order, one cell per node: its query, then its rows; each links to the cells that read it. */
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
    const readersOf = useMemo(() => {
        const readers = new Map<string, PipelineNode[]>();
        nodes.forEach((node) =>
            node.readNodeIds.forEach((readId) =>
                readers.set(readId, [...(readers.get(readId) ?? []), node]),
            ),
        );
        return readers;
    }, [nodes]);
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
                        readers={readersOf.get(node.nodeId) ?? []}
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

// PROTOTYPE — throwaway. Two variants of the live composer pipeline view
// inside the activity card, matching ToolCallRow's visual language.
// Question: "Only the running node expanded, the rest collapsed, approval
// inline — which structure fits the other tool calls best?"
// Rendered in storybook: AI Copilot/Composer Pipeline Prototype.
import {
    formatSql,
    QuerySourceType,
    WarehouseTypes,
    type ToolComposerQueryNode,
} from '@lightdash/common';
import {
    Box,
    Button,
    Collapse,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconCheck,
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconGitMerge,
    IconShieldCheck,
    IconSitemap,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { type ComposerQueryNodeStatus } from '../descriptions/ComposerQueriesToolCallDescription';
import { ToolCallChip } from '../ToolCallChip';
import rowStyles from '../ToolCallRow.module.css';
import styles from './ComposerPipelinePrototype.module.css';

export type PrototypeNodeStatus =
    | ComposerQueryNodeStatus
    | { status: 'awaiting_approval' };

export type ComposerPipelinePrototypeProps = {
    queries: ToolComposerQueryNode[];
    nodeStatuses: Record<string, PrototypeNodeStatus>;
    isLive: boolean;
};

const nodeIcon = (node: ToolComposerQueryNode) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return IconSitemap;
        case QuerySourceType.SQL:
            return IconDatabase;
        case QuerySourceType.EXTERNAL:
            return IconFileSpreadsheet;
        case QuerySourceType.DUCKDB:
            return IconGitMerge;
    }
};

const nodeKind = (node: ToolComposerQueryNode) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return 'Semantic layer';
        case QuerySourceType.SQL:
            return 'Warehouse SQL';
        case QuerySourceType.EXTERNAL:
            return 'External data';
        case QuerySourceType.DUCKDB:
            return 'DuckDB';
    }
};

const refs = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.values(items);

const nodeDetail = (
    node: ToolComposerQueryNode,
    titles: Record<string, string>,
) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return `${node.exploreName} · ${node.dimensions.length} dim · ${node.metrics.length} metric`;
        case QuerySourceType.SQL:
            return 'Project warehouse';
        case QuerySourceType.EXTERNAL:
            return `Reads ${refs(node.tables).join(', ')}`;
        case QuerySourceType.DUCKDB:
            return `Reads ${refs(node.references)
                .map((r) => titles[r] ?? r)
                .join(', ')}`;
    }
};

const statusText = (s: PrototypeNodeStatus | undefined) => {
    switch (s?.status) {
        case 'running':
            return 'running';
        case 'awaiting_approval':
            return 'awaiting approval';
        case 'error':
            return s.errorMessage ? `failed: ${s.errorMessage}` : 'failed';
        case 'pending':
            return 'queued';
        default:
            return null;
    }
};

const useSql = (node: ToolComposerQueryNode) =>
    useMemo(() => {
        if (!('sql' in node) || !node.sql) return null;
        return formatSql(
            node.sql,
            node.sourceType === QuerySourceType.DUCKDB ||
                node.sourceType === QuerySourceType.EXTERNAL
                ? WarehouseTypes.DUCKDB
                : undefined,
        );
    }, [node]);

const NodeBody: FC<{ node: ToolComposerQueryNode }> = ({ node }) => {
    const sql = useSql(node);
    if (node.sourceType === QuerySourceType.SEMANTIC_LAYER) {
        return (
            <Group gap={4} wrap="wrap">
                <Text size="xs" c="dimmed">
                    {node.exploreName}
                </Text>
                {[...node.dimensions, ...node.metrics].map((f) => (
                    <ToolCallChip key={f}>{f}</ToolCallChip>
                ))}
            </Group>
        );
    }
    return sql ? (
        <Box className={styles.code}>
            <CodeBlock code={sql} language="sql" />
        </Box>
    ) : null;
};

// Stub: no API. Mirrors SqlApprovalCard's buttons in a compact footer.
const ApprovalActions: FC = () => {
    const [decided, setDecided] = useState<string | null>(null);
    if (decided) {
        return (
            <Text size="xs" c="dimmed">
                {decided}
            </Text>
        );
    }
    return (
        <Group gap={6}>
            <Button
                size="compact-xs"
                color="indigo"
                leftSection={<MantineIcon icon={IconCheck} size={11} />}
                onClick={() => setDecided('Approved')}
            >
                Approve
            </Button>
            <Button
                size="compact-xs"
                variant="light"
                color="indigo"
                leftSection={<MantineIcon icon={IconShieldCheck} size={11} />}
                onClick={() => setDecided('Approved for this thread')}
            >
                Don't ask again this thread
            </Button>
            <Button
                size="compact-xs"
                variant="default"
                leftSection={<MantineIcon icon={IconX} size={11} />}
                onClick={() => setDecided('Rejected')}
            >
                Reject
            </Button>
        </Group>
    );
};

const StatusMark: FC<{ status: PrototypeNodeStatus | undefined }> = ({
    status,
}) => (
    <Box className={styles.mark} data-status={status?.status ?? 'none'}>
        {status?.status === 'success' ? (
            <MantineIcon icon={IconCheck} size={11} stroke={2.4} />
        ) : status?.status === 'error' ? (
            <MantineIcon icon={IconX} size={11} stroke={2.4} />
        ) : (
            <Box className={styles.dot} data-status={status?.status} />
        )}
    </Box>
);

const isActive = (s: PrototypeNodeStatus | undefined) =>
    s?.status === 'running' || s?.status === 'awaiting_approval';

/* ------------------------------------------------------------------ */
/* Variant A — step rows. Each node is a ToolCallRow-style row; the    */
/* active one auto-expands, the rest collapse and toggle on click.     */
/* ------------------------------------------------------------------ */

const StepRow: FC<{
    node: ToolComposerQueryNode;
    status: PrototypeNodeStatus | undefined;
    titles: Record<string, string>;
}> = ({ node, status, titles }) => {
    const active = isActive(status);
    const [userOpen, setUserOpen] = useState<boolean | null>(null);
    useEffect(() => setUserOpen(null), [status?.status]);
    const open = userOpen ?? active;
    const Icon = nodeIcon(node);
    const st = statusText(status);

    return (
        <Box className={rowStyles.row} data-expanded={open}>
            <UnstyledButton
                w="100%"
                className={rowStyles.rowButton}
                onClick={() => setUserOpen(!open)}
            >
                <Group
                    gap={8}
                    align="center"
                    wrap="nowrap"
                    className={rowStyles.head}
                >
                    <StatusMark status={status} />
                    <MantineIcon
                        icon={Icon}
                        size={13}
                        stroke={1.6}
                        className={rowStyles.icon}
                        data-status={active ? 'running' : undefined}
                    />
                    <Text size="xs" className={rowStyles.label}>
                        {node.title ?? node.nodeId}
                    </Text>
                    <Text size="xs" c="dimmed" truncate className={styles.meta}>
                        {nodeKind(node)} · {nodeDetail(node, titles)}
                    </Text>
                    {st ? (
                        <Text
                            size="xs"
                            className={styles.status}
                            data-status={status?.status}
                        >
                            {st}
                        </Text>
                    ) : null}
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={`${rowStyles.chevron} ${open ? rowStyles.chevronOpen : ''}`}
                    />
                </Group>
            </UnstyledButton>
            <Collapse expanded={open} transitionDuration={200}>
                <Stack gap={6} className={styles.rowBody}>
                    <NodeBody node={node} />
                    {status?.status === 'awaiting_approval' ? (
                        <ApprovalActions />
                    ) : null}
                </Stack>
            </Collapse>
        </Box>
    );
};

export const VariantA: FC<ComposerPipelinePrototypeProps> = ({
    queries,
    nodeStatuses,
}) => {
    const titles = Object.fromEntries(
        queries.map((n) => [n.nodeId, n.title ?? n.nodeId]),
    );
    return (
        <Stack gap={2}>
            {queries.map((n) => (
                <StepRow
                    key={n.nodeId}
                    node={n}
                    status={nodeStatuses[n.nodeId]}
                    titles={titles}
                />
            ))}
        </Stack>
    );
};

/* ------------------------------------------------------------------ */
/* Variant B — progress strip + focus pane. Nodes are pills on one     */
/* line; a single pane shows only the active node. Done pills peek.    */
/* ------------------------------------------------------------------ */

export const VariantB: FC<ComposerPipelinePrototypeProps> = ({
    queries,
    nodeStatuses,
    isLive,
}) => {
    const titles = Object.fromEntries(
        queries.map((n) => [n.nodeId, n.title ?? n.nodeId]),
    );
    const activeId =
        queries.find((n) => isActive(nodeStatuses[n.nodeId]))?.nodeId ?? null;
    const [peekId, setPeekId] = useState<string | null>(null);
    useEffect(() => setPeekId(null), [activeId]);
    const focusId = peekId ?? activeId;
    const focus = queries.find((n) => n.nodeId === focusId) ?? null;
    const focusStatus = focus ? nodeStatuses[focus.nodeId] : undefined;
    const doneCount = queries.filter(
        (n) => nodeStatuses[n.nodeId]?.status === 'success',
    ).length;

    return (
        <Stack gap={6}>
            <Group gap={4} wrap="wrap" align="center">
                {queries.map((n, i) => {
                    const s = nodeStatuses[n.nodeId];
                    return (
                        <UnstyledButton
                            key={n.nodeId}
                            className={styles.pill}
                            data-status={s?.status ?? 'none'}
                            data-focus={n.nodeId === focusId}
                            onClick={() =>
                                setPeekId(
                                    n.nodeId === activeId ? null : n.nodeId,
                                )
                            }
                        >
                            <StatusMark status={s} />
                            <span className={styles.pillIndex}>{i + 1}</span>
                            <span className={styles.pillLabel}>
                                {n.title ?? n.nodeId}
                            </span>
                        </UnstyledButton>
                    );
                })}
                <Text size="xs" c="dimmed" ml={4}>
                    {doneCount}/{queries.length}
                </Text>
            </Group>
            {focus ? (
                <Box className={styles.pane} key={focus.nodeId}>
                    <Group gap={8} wrap="nowrap" className={styles.paneHead}>
                        <MantineIcon
                            icon={nodeIcon(focus)}
                            size={13}
                            stroke={1.6}
                            className={rowStyles.icon}
                            data-status={
                                isActive(focusStatus) ? 'running' : undefined
                            }
                        />
                        <Text size="xs" className={rowStyles.label}>
                            {focus.title ?? focus.nodeId}
                        </Text>
                        <Text
                            size="xs"
                            c="dimmed"
                            truncate
                            className={styles.meta}
                        >
                            {nodeKind(focus)} · {nodeDetail(focus, titles)}
                        </Text>
                        {statusText(focusStatus) ? (
                            <Text
                                size="xs"
                                className={styles.status}
                                data-status={focusStatus?.status}
                            >
                                {statusText(focusStatus)}
                            </Text>
                        ) : null}
                    </Group>
                    <NodeBody node={focus} />
                    {focusStatus?.status === 'awaiting_approval' ? (
                        <ApprovalActions />
                    ) : null}
                </Box>
            ) : isLive ? null : null}
        </Stack>
    );
};

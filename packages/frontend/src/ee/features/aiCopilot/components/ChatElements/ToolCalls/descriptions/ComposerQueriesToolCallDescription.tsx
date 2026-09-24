import {
    formatSql,
    QuerySourceType,
    type ToolComposerQueriesArgs,
    type ToolComposerQueryNode,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconCheck,
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconGitMerge,
    IconSitemap,
    IconX,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { SqlApprovalActions, type SqlApprovalTarget } from '../SqlApprovalCard';
import { ToolCallChip } from '../ToolCallChip';
import rowStyles from '../ToolCallRow.module.css';
import styles from './ComposerQueriesToolCallDescription.module.css';

/**
 * Live execution status of one pipeline node, derived from the transient
 * step-progress events the composer tool emits while it runs. Undefined maps
 * (the persisted, post-run view) render the pipeline without indicators.
 */
export type ComposerQueryNodeStatus =
    | { status: 'pending' }
    | { status: 'awaiting_approval' }
    | { status: 'running' }
    | { status: 'success' }
    | { status: 'error'; errorMessage: string | null };

/** Approval target for the SQL nodes of a pipeline waiting on the user. */
export type ComposerApprovalTarget = Omit<SqlApprovalTarget, 'toolCallId'>;

type ComposerQueriesToolCallDescriptionProps = {
    queries: ToolComposerQueriesArgs['queries'];
    nodeStatuses?: Record<string, ComposerQueryNodeStatus>;
    /** Present while the pipeline's warehouse SQL nodes await approval. */
    approval?: SqlApprovalTarget;
};

const NODE_STATUS_LABELS = {
    pending: 'Queued',
    awaiting_approval: 'Awaiting approval',
    running: 'Running',
    success: 'Completed',
    error: 'Failed',
} as const;

// Trailing status word on the row; success reads from the check mark alone.
const getNodeStatusText = (nodeStatus: ComposerQueryNodeStatus) =>
    nodeStatus.status === 'success'
        ? null
        : NODE_STATUS_LABELS[nodeStatus.status].toLowerCase();

const isActiveStatus = (nodeStatus: ComposerQueryNodeStatus | undefined) =>
    nodeStatus?.status === 'running' ||
    nodeStatus?.status === 'awaiting_approval';

const NodeStatusIndicator: FC<{ nodeStatus: ComposerQueryNodeStatus }> = ({
    nodeStatus,
}) => {
    const label =
        nodeStatus.status === 'error' && nodeStatus.errorMessage
            ? `Failed: ${nodeStatus.errorMessage}`
            : NODE_STATUS_LABELS[nodeStatus.status];
    return (
        <Tooltip label={label} position="top">
            <Box
                className={styles.statusIndicator}
                data-status={nodeStatus.status}
                aria-label={label}
            >
                {nodeStatus.status === 'success' ? (
                    <MantineIcon icon={IconCheck} size={11} stroke={2.4} />
                ) : nodeStatus.status === 'error' ? (
                    <MantineIcon icon={IconX} size={11} stroke={2.4} />
                ) : (
                    <Box
                        className={styles.statusDot}
                        data-status={nodeStatus.status}
                    />
                )}
            </Box>
        </Tooltip>
    );
};

const referenceAliases = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.keys(items);

// Map-form values are node ids or stored queryUuids; only node ids get titles
const referenceTargets = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.values(items);

const getNodePresentation = (
    node: ToolComposerQueryNode,
    titlesByNodeId: Record<string, string>,
) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return {
                icon: IconSitemap,
                badge: 'Semantic layer',
                detail: `${node.exploreName} · ${node.dimensions.length} dimension${node.dimensions.length === 1 ? '' : 's'} · ${node.metrics.length} metric${node.metrics.length === 1 ? '' : 's'}`,
            } as const;
        case QuerySourceType.SQL:
            return {
                icon: IconDatabase,
                badge: 'Warehouse SQL',
                detail: 'Project warehouse',
            } as const;
        case QuerySourceType.EXTERNAL: {
            const tables = referenceAliases(node.tables);
            return {
                icon: IconFileSpreadsheet,
                badge: 'External data',
                detail: `Reads ${tables.join(', ')}`,
            } as const;
        }
        case QuerySourceType.DUCKDB: {
            const references = referenceTargets(node.references).map(
                (reference) => titlesByNodeId[reference] ?? reference,
            );
            return {
                icon: IconGitMerge,
                badge: 'DuckDB compose',
                detail: `Reads ${references.join(', ')}`,
            } as const;
        }
    }
};

const NodeBody: FC<{ node: ToolComposerQueryNode }> = ({ node }) => {
    const formattedSql = useMemo(() => {
        if (!('sql' in node) || !node.sql) return null;
        return formatSql(
            node.sql,
            node.sourceType === QuerySourceType.DUCKDB ||
                node.sourceType === QuerySourceType.EXTERNAL
                ? WarehouseTypes.DUCKDB
                : undefined,
        );
    }, [node]);

    if (node.sourceType === QuerySourceType.SEMANTIC_LAYER) {
        return (
            <Group gap={4} wrap="wrap">
                <Text size="xs" c="dimmed">
                    {node.exploreName}
                </Text>
                {[...node.dimensions, ...node.metrics].map((fieldId) => (
                    <ToolCallChip key={fieldId}>{fieldId}</ToolCallChip>
                ))}
            </Group>
        );
    }
    return formattedSql ? (
        <Box className={styles.code}>
            <CodeBlock code={formattedSql} language="sql" />
        </Box>
    ) : null;
};

const ComposerQueryNode: FC<{
    node: ToolComposerQueryNode;
    titlesByNodeId: Record<string, string>;
    nodeStatus?: ComposerQueryNodeStatus;
    approval?: SqlApprovalTarget;
}> = ({ node, titlesByNodeId, nodeStatus, approval }) => {
    const presentation = getNodePresentation(node, titlesByNodeId);
    const active = isActiveStatus(nodeStatus);
    // Active and failed nodes open by default; a user toggle wins until the status changes.
    const defaultOpen = active || nodeStatus?.status === 'error';
    const [userOpen, setUserOpen] = useState<boolean | null>(null);
    const [toggledForStatus, setToggledForStatus] = useState(
        nodeStatus?.status,
    );
    if (toggledForStatus !== nodeStatus?.status) {
        setToggledForStatus(nodeStatus?.status);
        setUserOpen(null);
    }
    const open = userOpen ?? defaultOpen;
    const statusText = nodeStatus ? getNodeStatusText(nodeStatus) : null;
    const showApproval =
        approval !== undefined && nodeStatus?.status === 'awaiting_approval';

    return (
        <Box
            className={rowStyles.row}
            data-expanded={open}
            data-status={nodeStatus?.status}
        >
            <UnstyledButton
                w="100%"
                className={rowStyles.rowButton}
                onClick={() => setUserOpen(!open)}
                aria-expanded={open}
            >
                <Group
                    gap={8}
                    align="center"
                    wrap="nowrap"
                    className={rowStyles.head}
                >
                    {nodeStatus ? (
                        <NodeStatusIndicator nodeStatus={nodeStatus} />
                    ) : null}
                    <MantineIcon
                        icon={presentation.icon}
                        size={13}
                        stroke={1.6}
                        className={rowStyles.icon}
                        data-status={active ? 'running' : undefined}
                    />
                    <Text size="xs" className={rowStyles.label} truncate>
                        {node.title ?? node.nodeId}
                    </Text>
                    <ToolCallChip>{presentation.badge}</ToolCallChip>
                    <Text
                        size="xs"
                        c="dimmed"
                        truncate
                        className={styles.detail}
                    >
                        {presentation.detail}
                    </Text>
                    {statusText ? (
                        <Text
                            size="xs"
                            className={styles.statusText}
                            data-status={nodeStatus?.status}
                        >
                            {statusText}
                        </Text>
                    ) : null}
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={clsx(
                            rowStyles.chevron,
                            open && rowStyles.chevronOpen,
                        )}
                    />
                </Group>
            </UnstyledButton>
            <Collapse expanded={open} transitionDuration={200}>
                <Stack gap={6} className={styles.body}>
                    <NodeBody node={node} />
                    {showApproval ? <SqlApprovalActions {...approval} /> : null}
                </Stack>
            </Collapse>
        </Box>
    );
};

export const ComposerQueriesToolCallDescription: FC<
    ComposerQueriesToolCallDescriptionProps
> = ({ queries, nodeStatuses, approval }) => {
    const titlesByNodeId = useMemo(
        () =>
            Object.fromEntries(
                queries.map((node) => [node.nodeId, node.title ?? node.nodeId]),
            ),
        [queries],
    );
    // One decision covers the whole call, so the actions render once, under
    // the last node waiting on it.
    const approvalNodeId = queries.findLast(
        (node) => nodeStatuses?.[node.nodeId]?.status === 'awaiting_approval',
    )?.nodeId;
    return (
        <Stack gap={2} align="stretch" w="100%" className={styles.pipeline}>
            {queries.map((node) => (
                <ComposerQueryNode
                    key={node.nodeId}
                    node={node}
                    titlesByNodeId={titlesByNodeId}
                    nodeStatus={nodeStatuses?.[node.nodeId]}
                    approval={
                        node.nodeId === approvalNodeId ? approval : undefined
                    }
                />
            ))}
        </Stack>
    );
};

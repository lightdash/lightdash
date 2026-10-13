import {
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
    UnstyledButton,
} from '@mantine/core';
import {
    IconBrandPython,
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconGitMerge,
    IconSitemap,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useMemo, useState, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import {
    useComposerNodeStatusLabel,
    type ComposerQueryNodeStatus,
} from '../../composerNodeStatus';
import { NodeStatusIndicator } from '../../ComposerNodeStatusIndicator';
import {
    SqlApprovalActions,
    type SqlApprovalTarget,
} from '../SqlApprovalActions';
import { ToolCallChip } from '../ToolCallChip';
import rowStyles from '../ToolCallRow.module.css';
import { ToolCallSqlBlock } from '../ToolCallSqlBlock';
import sqlBlockStyles from '../ToolCallSqlBlock.module.css';
import styles from './ComposerQueriesToolCallDescription.module.css';

type ComposerQueriesToolCallDescriptionProps = {
    queries: ToolComposerQueriesArgs['queries'];
    nodeStatuses?: Record<string, ComposerQueryNodeStatus>;
    /** Present while the pipeline's warehouse SQL nodes await approval. */
    approval?: SqlApprovalTarget;
};

const isActiveStatus = (nodeStatus: ComposerQueryNodeStatus | undefined) =>
    nodeStatus?.status === 'running' ||
    nodeStatus?.status === 'awaiting_approval';

const referenceAliases = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.keys(items);

// Reads of nodes from earlier versions have no title in this submission
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
        case QuerySourceType.PYTHON: {
            const references = referenceTargets(node.references).map(
                (reference) => titlesByNodeId[reference] ?? reference,
            );
            return {
                icon: IconBrandPython,
                badge: 'Python',
                detail: `Reads ${references.join(', ')}`,
            } as const;
        }
    }
};

const NodeBody: FC<{ node: ToolComposerQueryNode }> = ({ node }) => {
    const canViewSql = useCanViewAiAgentSql();

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
    if (node.sourceType === QuerySourceType.PYTHON) {
        if (!canViewSql || !node.code) return null;
        return (
            <Box className={sqlBlockStyles.code}>
                <CodeBlock code={node.code} language="python" />
            </Box>
        );
    }
    if (!canViewSql || !node.sql) return null;
    return (
        <ToolCallSqlBlock
            sql={node.sql}
            dialect={
                node.sourceType === QuerySourceType.DUCKDB ||
                node.sourceType === QuerySourceType.EXTERNAL
                    ? WarehouseTypes.DUCKDB
                    : undefined
            }
        />
    );
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
    const [userToggle, setUserToggle] = useState<{
        status: ComposerQueryNodeStatus['status'] | undefined;
        open: boolean;
    } | null>(null);
    const userOpen =
        userToggle?.status === nodeStatus?.status ? userToggle?.open : null;
    const setUserOpen = (value: boolean) =>
        setUserToggle({ status: nodeStatus?.status, open: value });
    const open = userOpen ?? defaultOpen;
    const statusLabel = useComposerNodeStatusLabel();
    // Trailing status word on the row; success reads from the check mark alone.
    const statusText =
        nodeStatus && nodeStatus.status !== 'success'
            ? statusLabel(nodeStatus.status).toLowerCase()
            : null;
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
                        <NodeStatusIndicator status={nodeStatus.status} />
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
                    {showApproval ? (
                        <SqlApprovalActions {...approval} review={null} />
                    ) : null}
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

import {
    formatSql,
    QuerySourceType,
    type ToolComposerQueriesArgs,
    type ToolComposerQueryNode,
    WarehouseTypes,
} from '@lightdash/common';
import { Badge, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import CodeBlock from '../../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import styles from './ComposerQueriesToolCallDescription.module.css';

/**
 * Live execution status of one pipeline node, derived from the transient
 * step-progress events the composer tool emits while it runs. Undefined maps
 * (the persisted, post-run view) render the pipeline without indicators.
 */
export type ComposerQueryNodeStatus =
    | { status: 'pending' }
    | { status: 'running' }
    | { status: 'success' }
    | { status: 'error'; errorMessage: string | null };

type ComposerQueriesToolCallDescriptionProps = {
    queries: ToolComposerQueriesArgs['queries'];
    nodeStatuses?: Record<string, ComposerQueryNodeStatus>;
};

const NODE_STATUS_LABELS = {
    pending: 'Queued',
    running: 'Running',
    success: 'Completed',
    error: 'Failed',
} as const;

const NodeStatusIndicator: FC<{ nodeStatus: ComposerQueryNodeStatus }> = ({
    nodeStatus,
}) => {
    const label =
        nodeStatus.status === 'error' && nodeStatus.errorMessage
            ? `Failed: ${nodeStatus.errorMessage}`
            : NODE_STATUS_LABELS[nodeStatus.status];
    return (
        <Tooltip label={label} position="top" withArrow>
            <Box
                className={styles.statusIndicator}
                data-status={nodeStatus.status}
                aria-label={label}
            >
                {nodeStatus.status === 'success' ? (
                    <MantineIcon
                        icon={IconCheck}
                        size={11}
                        stroke={2.4}
                        className={styles.statusIcon}
                    />
                ) : nodeStatus.status === 'error' ? (
                    <MantineIcon
                        icon={IconX}
                        size={11}
                        stroke={2.4}
                        className={styles.statusIcon}
                    />
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

const getNodePresentation = (node: ToolComposerQueryNode) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return {
                badge: 'Semantic layer',
                color: 'indigo',
                detail: `${node.exploreName} · ${node.dimensions.length} dimension${node.dimensions.length === 1 ? '' : 's'} · ${node.metrics.length} metric${node.metrics.length === 1 ? '' : 's'}`,
            } as const;
        case QuerySourceType.SQL:
            return {
                badge: 'Warehouse SQL',
                color: 'ldGray.6',
                detail: 'Project warehouse',
            } as const;
        case QuerySourceType.EXTERNAL: {
            const tables = referenceAliases(node.tables);
            return {
                badge: 'External data',
                color: 'cyan',
                detail: `Reads ${tables.join(', ')}`,
            } as const;
        }
        case QuerySourceType.DUCKDB: {
            const references = referenceAliases(node.references);
            return {
                badge: 'DuckDB compose',
                color: 'violet',
                detail: `Combines ${references.join(', ')}`,
            } as const;
        }
    }
};

const ComposerQueryNode: FC<{
    node: ToolComposerQueryNode;
    nodeStatus?: ComposerQueryNodeStatus;
}> = ({ node, nodeStatus }) => {
    const presentation = getNodePresentation(node);
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

    return (
        <Box className={styles.node} data-status={nodeStatus?.status}>
            <Group gap={6} wrap="nowrap" className={styles.header}>
                {nodeStatus ? (
                    <NodeStatusIndicator nodeStatus={nodeStatus} />
                ) : null}
                <Text component="span" className={styles.nodeId}>
                    {node.nodeId}
                </Text>
                <Badge
                    color={presentation.color}
                    size="xs"
                    variant="light"
                    className={styles.badge}
                >
                    {presentation.badge}
                </Badge>
                <Text size="xs" c="dimmed" truncate className={styles.detail}>
                    {presentation.detail}
                </Text>
            </Group>
            {formattedSql ? (
                <Box className={styles.code}>
                    <CodeBlock code={formattedSql} language="sql" />
                </Box>
            ) : null}
        </Box>
    );
};

export const ComposerQueriesToolCallDescription: FC<
    ComposerQueriesToolCallDescriptionProps
> = ({ queries, nodeStatuses }) => (
    <Stack gap={10} align="stretch" w="100%" className={styles.pipeline}>
        {queries.map((node) => (
            <ComposerQueryNode
                key={node.nodeId}
                node={node}
                nodeStatus={nodeStatuses?.[node.nodeId]}
            />
        ))}
    </Stack>
);

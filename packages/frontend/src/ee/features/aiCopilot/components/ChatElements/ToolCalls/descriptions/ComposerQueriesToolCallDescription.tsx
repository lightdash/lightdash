import {
    assertUnreachable,
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
    IconApi,
    IconArrowsJoin,
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
import {
    useApiSourceExploreConnectionUuid,
    useLiveSourceExplore,
} from '../../../../../../../features/externalConnections/liveSources/apiSourceExplore';
import { getLiveSource } from '../../../../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import { useLiveSourceConnection } from '../../../../../../../features/externalConnections/liveSources/useLiveSourceConnection';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import {
    useComposerNodeStatusLabel,
    type ComposerQueryNodeStatus,
} from '../../composerNodeStatus';
import shimmerStyles from '../../shimmer.module.css';
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

const referenceAliases = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.keys(items);

// Reads of nodes from earlier versions have no title in this submission
const referenceTargets = (items: string[] | Record<string, string>) =>
    Array.isArray(items) ? items : Object.values(items);

// Streaming args can land before their inputs, so an empty list says nothing.
const readsDetail = (inputs: string[]) => {
    const named = inputs.filter((input) => input.length > 0);
    return named.length > 0 ? `Reads ${named.join(', ')}` : '';
};

// One look for every query on a live data source, through its explore or an
// api node from an older thread.
const LIVE_SOURCE_PRESENTATION = {
    icon: IconApi,
    badge: 'Live data source',
    detail: '',
} as const;

const getNodePresentation = (
    node: ToolComposerQueryNode,
    titlesByNodeId: Record<string, string>,
) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return {
                icon: IconSitemap,
                badge: 'Semantic layer',
                detail: '',
            } as const;
        case QuerySourceType.SQL:
            return {
                icon: IconDatabase,
                badge: 'Warehouse SQL',
                detail: '',
            } as const;
        case QuerySourceType.EXTERNAL: {
            const tables = referenceAliases(node.tables);
            return {
                icon: IconFileSpreadsheet,
                badge: 'External data',
                detail: readsDetail(tables),
            } as const;
        }
        case QuerySourceType.DUCKDB: {
            const references = referenceTargets(node.references).map(
                (reference) => titlesByNodeId[reference] ?? reference,
            );
            return {
                icon: IconGitMerge,
                badge: 'DuckDB compose',
                detail: readsDetail(references),
            } as const;
        }
        case QuerySourceType.PYTHON: {
            const references = referenceTargets(node.references).map(
                (reference) => titlesByNodeId[reference] ?? reference,
            );
            return {
                icon: IconBrandPython,
                badge: 'Python',
                detail: readsDetail(references),
            } as const;
        }
        case QuerySourceType.API:
            return LIVE_SOURCE_PRESENTATION;
        case QuerySourceType.MERGE:
            return {
                icon: IconArrowsJoin,
                badge: 'Merge',
                detail: readsDetail(
                    node.sources.map(
                        ({ nodeId }) => titlesByNodeId[nodeId] ?? nodeId,
                    ),
                ),
            } as const;
        default:
            return assertUnreachable(node, 'Unknown composer node');
    }
};

/** A live data source explore reads by its label, e.g. "Events". */
const NodeExploreFields: FC<{ exploreName: string; fieldIds: string[] }> = ({
    exploreName,
    fieldIds,
}) => {
    const liveSource = useLiveSourceExplore(exploreName);
    const prefix = `${exploreName}_`;
    return (
        <Group gap={4} wrap="wrap">
            <Text size="xs" c="dimmed">
                {liveSource?.label ?? exploreName}
            </Text>
            {fieldIds.map((fieldId) => (
                <ToolCallChip key={fieldId} ff="monospace">
                    {fieldId.startsWith(prefix)
                        ? fieldId.slice(prefix.length)
                        : fieldId}
                </ToolCallChip>
            ))}
        </Group>
    );
};

const NodeBody: FC<{ node: ToolComposerQueryNode }> = ({ node }) => {
    const canViewSql = useCanViewAiAgentSql();

    if (node.sourceType === QuerySourceType.SEMANTIC_LAYER) {
        return (
            <NodeExploreFields
                exploreName={node.exploreName}
                fieldIds={[...node.dimensions, ...node.metrics]}
            />
        );
    }
    if (node.sourceType === QuerySourceType.PYTHON) {
        if (!canViewSql || !node.code) return null;
        return (
            <Box className={sqlBlockStyles.code}>
                <CodeBlock
                    code={node.code}
                    language="python"
                    classNames={{
                        codeHighlight: sqlBlockStyles.codeHighlight,
                        code: sqlBlockStyles.codeInner,
                    }}
                />
            </Box>
        );
    }
    if (node.sourceType === QuerySourceType.API) {
        if (!canViewSql || !node.payload.query) return null;
        return (
            <Box className={sqlBlockStyles.code}>
                <CodeBlock
                    code={node.payload.query}
                    language="sql"
                    classNames={{
                        codeHighlight: sqlBlockStyles.codeHighlight,
                        code: sqlBlockStyles.codeInner,
                    }}
                />
            </Box>
        );
    }
    if (node.sourceType === QuerySourceType.MERGE) return null;
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
    const exploreConnectionUuid = useApiSourceExploreConnectionUuid(
        node.sourceType === QuerySourceType.SEMANTIC_LAYER
            ? node.exploreName
            : null,
    );
    const liveSourceConnectionUuid =
        node.sourceType === QuerySourceType.API
            ? node.connectionUuid
            : exploreConnectionUuid;
    const liveSource = useLiveSourceConnection(liveSourceConnectionUuid);
    const presentation = liveSourceConnectionUuid
        ? LIVE_SOURCE_PRESENTATION
        : getNodePresentation(node, titlesByNodeId);
    // Only nodes awaiting approval open by default; a user toggle wins until
    // the status changes.
    const defaultOpen = nodeStatus?.status === 'awaiting_approval';
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
    // Queued, running and done read from the title; only approval gets words.
    const statusText =
        nodeStatus?.status === 'awaiting_approval'
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
                    className={styles.head}
                >
                    {liveSourceConnectionUuid ? (
                        <Tooltip
                            label={
                                liveSource
                                    ? getLiveSource(liveSource.connector).label
                                    : null
                            }
                            disabled={!liveSource}
                        >
                            <Box
                                component="span"
                                display="inline-flex"
                                role="img"
                                aria-label={
                                    nodeStatus
                                        ? statusLabel(nodeStatus.status)
                                        : liveSource
                                          ? getLiveSource(liveSource.connector)
                                                .label
                                          : presentation.badge
                                }
                            >
                                <LiveSourceIcon
                                    connector={liveSource?.connector ?? null}
                                    size={13}
                                />
                            </Box>
                        </Tooltip>
                    ) : (
                        <MantineIcon
                            icon={presentation.icon}
                            size={13}
                            stroke={1.6}
                            className={styles.icon}
                            data-status={nodeStatus?.status}
                            role={nodeStatus ? 'img' : undefined}
                            aria-label={
                                nodeStatus
                                    ? statusLabel(nodeStatus.status)
                                    : undefined
                            }
                        />
                    )}
                    <Text
                        size="xs"
                        truncate
                        className={clsx(
                            styles.title,
                            nodeStatus?.status === 'running' &&
                                shimmerStyles.shimmer,
                        )}
                        data-status={nodeStatus?.status}
                    >
                        {node.title ?? node.nodeId}
                    </Text>
                    <Text size="xs" truncate className={styles.suffix}>
                        {liveSource?.name ?? presentation.badge}
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
                    {presentation.detail ? (
                        <Text size="xs" c="dimmed">
                            {presentation.detail}
                        </Text>
                    ) : null}
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

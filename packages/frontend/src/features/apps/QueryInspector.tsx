import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Code,
    Collapse,
    CopyButton,
    Group,
    ScrollArea,
    Switch,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconCopy,
    IconDatabase,
    IconExternalLink,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import type { QueryEvent } from './hooks/useAppSdkBridge';
import classes from './QueryInspector.module.css';

type TrackedQuery = QueryEvent & {
    /** Merged from the initial POST + subsequent poll results */
};

type Props = {
    queries: TrackedQuery[];
    projectUuid: string;
    onClear: () => void;
    persistLogs: boolean;
    onPersistLogsChange: (value: boolean) => void;
};

const statusColor = (status: TrackedQuery['status']): string => {
    switch (status) {
        case 'ready':
            return 'green';
        case 'running':
        case 'pending':
            return 'blue';
        case 'error':
            return 'red';
        default:
            return 'gray';
    }
};

const buildExploreUrl = (
    projectUuid: string,
    query: TrackedQuery,
): string | null => {
    if (!query.exploreName) return null;
    const chartVersion: CreateSavedChartVersion = {
        tableName: query.exploreName,
        metricQuery: {
            exploreName: query.exploreName,
            dimensions: query.dimensions,
            metrics: query.metrics,
            filters:
                (query.filters as CreateSavedChartVersion['metricQuery']['filters']) ??
                {},
            sorts:
                (query.sorts as CreateSavedChartVersion['metricQuery']['sorts']) ??
                [],
            limit: query.limit,
            tableCalculations: query.tableCalculations.map((tc) => ({
                name: tc.name,
                displayName: tc.displayName,
                sql: tc.sql,
            })),
        },
        chartConfig: {
            type: ChartType.TABLE,
            config: {},
        },
        tableConfig: { columnOrder: [] },
    };
    const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
        projectUuid,
        chartVersion,
    );
    return `${pathname}?${search}`;
};

const QueryRow: FC<{ query: TrackedQuery; projectUuid: string }> = ({
    query,
    projectUuid,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [jsonExpanded, setJsonExpanded] = useState(false);

    return (
        <Box className={classes.queryRow}>
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.queryHeader}
                onClick={() => setExpanded((v) => !v)}
            >
                <ActionIcon variant="subtle" size="xs" color="gray">
                    {expanded ? (
                        <MantineIcon icon={IconChevronDown} size={12} />
                    ) : (
                        <MantineIcon icon={IconChevronRight} size={12} />
                    )}
                </ActionIcon>
                <Text size="xs" fw={500} truncate="end">
                    {query.label ||
                        query.exploreName ||
                        query.queryUuid?.slice(0, 8)}
                </Text>
                <Badge
                    size="xs"
                    variant="light"
                    color={statusColor(query.status)}
                >
                    {query.status}
                </Badge>
                {query.rowCount !== null && (
                    <Text size="xs" c="dimmed">
                        {query.rowCount} rows
                    </Text>
                )}
                <Box ml="auto" />
                {query.durationMs !== null && (
                    <Text size="xs" c="dimmed">
                        {query.durationMs}ms
                    </Text>
                )}
            </Group>
            <Collapse in={expanded}>
                <Group
                    gap={0}
                    wrap="nowrap"
                    align="stretch"
                    className={classes.queryDetailsRow}
                >
                    <Box className={classes.queryDetails}>
                        {(() => {
                            const exploreUrl = buildExploreUrl(
                                projectUuid,
                                query,
                            );
                            return exploreUrl ? (
                                <Anchor
                                    href={exploreUrl}
                                    target="_blank"
                                    size="xs"
                                    className={classes.openInExplore}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Group gap={4}>
                                        <MantineIcon
                                            icon={IconExternalLink}
                                            size={12}
                                        />
                                        Open in Explore
                                    </Group>
                                </Anchor>
                            ) : null;
                        })()}
                        {query.exploreName && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Explore
                                </Text>
                                <Text size="xs">{query.exploreName}</Text>
                            </Box>
                        )}
                        {query.dimensions.length > 0 && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Dimensions
                                </Text>
                                <Text size="xs">
                                    {query.dimensions.join(', ')}
                                </Text>
                            </Box>
                        )}
                        {query.metrics.length > 0 && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Metrics
                                </Text>
                                <Text size="xs">
                                    {query.metrics.join(', ')}
                                </Text>
                            </Box>
                        )}
                        {query.tableCalculations.length > 0 && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Table Calculations
                                </Text>
                                <Text size="xs">
                                    {query.tableCalculations
                                        .map((tc) => tc.displayName)
                                        .join(', ')}
                                </Text>
                            </Box>
                        )}
                        {query.additionalMetrics.length > 0 && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Additional Metrics
                                </Text>
                                <Text size="xs">
                                    {query.additionalMetrics
                                        .map((am) => am.label)
                                        .join(', ')}
                                </Text>
                            </Box>
                        )}
                        {query.error && (
                            <Box>
                                <Text size="xs" fw={600} c="red">
                                    Error
                                </Text>
                                <Text size="xs" c="red">
                                    {query.error}
                                </Text>
                            </Box>
                        )}
                        <Box>
                            <Text size="xs" fw={600} c="dimmed">
                                Limit
                            </Text>
                            <Text size="xs">{query.limit}</Text>
                        </Box>
                        {query.queryUuid && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Query UUID
                                </Text>
                                <Text size="xs" ff="monospace">
                                    {query.queryUuid}
                                </Text>
                            </Box>
                        )}
                        {query.durationMs !== null && (
                            <Box>
                                <Text size="xs" fw={600} c="dimmed">
                                    Warehouse execution time
                                </Text>
                                <Text size="xs">{query.durationMs}ms</Text>
                            </Box>
                        )}
                    </Box>
                    {query.rawMetricQuery && (
                        <Box className={classes.rawJsonPanel}>
                            <Group
                                gap={4}
                                onClick={() => setJsonExpanded((v) => !v)}
                                style={{ cursor: 'pointer' }}
                            >
                                <ActionIcon
                                    variant="subtle"
                                    size="xs"
                                    color="gray"
                                >
                                    {jsonExpanded ? (
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size={10}
                                        />
                                    ) : (
                                        <MantineIcon
                                            icon={IconChevronRight}
                                            size={10}
                                        />
                                    )}
                                </ActionIcon>
                                <Text size="xs" fw={600} c="dimmed">
                                    Raw JSON
                                </Text>
                                <CopyButton
                                    value={JSON.stringify(
                                        query.rawMetricQuery,
                                        null,
                                        2,
                                    )}
                                >
                                    {({ copied, copy }) => (
                                        <ActionIcon
                                            variant="subtle"
                                            size="xs"
                                            color={copied ? 'green' : 'gray'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                copy();
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconCopy}
                                                size={10}
                                            />
                                        </ActionIcon>
                                    )}
                                </CopyButton>
                            </Group>
                            <Collapse in={jsonExpanded}>
                                <ScrollArea.Autosize mah={200}>
                                    <Code block fz={10}>
                                        {JSON.stringify(
                                            query.rawMetricQuery,
                                            null,
                                            2,
                                        )}
                                    </Code>
                                </ScrollArea.Autosize>
                            </Collapse>
                        </Box>
                    )}
                </Group>
            </Collapse>
        </Box>
    );
};

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

const QueryInspector: FC<Props> = ({
    queries,
    projectUuid,
    onClear,
    persistLogs,
    onPersistLogsChange,
}) => {
    const [collapsed, setCollapsed] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const dragRef = useRef<{
        startY: number;
        startHeight: number;
    } | null>(null);

    const toggle = useCallback(() => setCollapsed((v) => !v), []);

    const handleResizeStart = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { startY: e.clientY, startHeight: height };
        },
        [height],
    );

    const handleResizeMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragRef.current) return;
            const delta = dragRef.current.startY - e.clientY;
            const newHeight = Math.min(
                MAX_HEIGHT,
                Math.max(MIN_HEIGHT, dragRef.current.startHeight + delta),
            );
            setHeight(newHeight);
        },
        [],
    );

    const handleResizeEnd = useCallback(() => {
        dragRef.current = null;
    }, []);

    const handleDismiss = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setDismissed(true);
        setCollapsed(true);
    }, []);

    const handleClear = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onClear();
        },
        [onClear],
    );

    // Hide the panel entirely only when there's nothing to show *and* the
    // user hasn't engaged with it. If they've expanded it (e.g. cleared the
    // log to wait for fresh queries), keep it mounted with an empty state so
    // the next query lands somewhere visible.
    if (queries.length === 0 && collapsed) return null;

    // Dismissed — show a small icon to reopen
    if (dismissed) {
        return (
            <Box className={classes.iconOnly}>
                <ActionIcon
                    variant="filled"
                    color="gray"
                    size="md"
                    radius="xl"
                    onClick={() => setDismissed(false)}
                >
                    <MantineIcon icon={IconDatabase} size={14} />
                </ActionIcon>
            </Box>
        );
    }

    return (
        <Box className={classes.container}>
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.titleBar}
                onClick={toggle}
            >
                <MantineIcon icon={IconDatabase} size={14} />
                <Text size="xs" fw={600}>
                    Queries ({queries.length})
                </Text>
                <Box ml="auto" />
                {!collapsed && (
                    <>
                        <Tooltip label="Clear queries" withArrow position="top">
                            <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="gray"
                                onClick={handleClear}
                                aria-label="Clear queries"
                            >
                                <MantineIcon icon={IconTrash} size={12} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            label="Preserve queries across iframe refreshes and new app versions"
                            withArrow
                            position="top"
                        >
                            <Box onClick={(e) => e.stopPropagation()}>
                                <Switch
                                    size="xs"
                                    label="Persist"
                                    checked={persistLogs}
                                    onChange={(e) =>
                                        onPersistLogsChange(
                                            e.currentTarget.checked,
                                        )
                                    }
                                />
                            </Box>
                        </Tooltip>
                    </>
                )}
                <ActionIcon variant="subtle" size="xs" color="gray">
                    {collapsed ? (
                        <MantineIcon icon={IconChevronRight} size={12} />
                    ) : (
                        <MantineIcon icon={IconChevronDown} size={12} />
                    )}
                </ActionIcon>
                {!collapsed && (
                    <ActionIcon
                        variant="subtle"
                        size="xs"
                        color="gray"
                        onClick={handleDismiss}
                        aria-label="Close queries panel"
                    >
                        <MantineIcon icon={IconX} size={12} />
                    </ActionIcon>
                )}
            </Group>
            <Collapse in={!collapsed}>
                <Box
                    className={classes.resizeHandle}
                    onPointerDown={handleResizeStart}
                    onPointerMove={handleResizeMove}
                    onPointerUp={handleResizeEnd}
                />
                <ScrollArea h={height}>
                    <Box className={classes.queryList}>
                        {queries.length === 0 ? (
                            <Box className={classes.emptyState}>
                                <Text size="xs" c="dimmed">
                                    No queries yet
                                </Text>
                            </Box>
                        ) : (
                            queries.map((q) => (
                                <QueryRow
                                    key={q.queryUuid ?? q.id}
                                    query={q}
                                    projectUuid={projectUuid}
                                />
                            ))
                        )}
                    </Box>
                </ScrollArea>
            </Collapse>
        </Box>
    );
};

export default QueryInspector;

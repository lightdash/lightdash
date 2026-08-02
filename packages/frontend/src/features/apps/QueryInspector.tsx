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
    Text,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconCopy,
    IconDeviceFloppy,
    IconExternalLink,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import classes from './AppInspector.module.css';
import type { QueryEvent } from './hooks/useAppSdkBridge';
import SaveQueryToLightdashModal from './SaveQueryToLightdashModal';
import { trackedQueryToChartVersion } from './utils/trackedQueryToChart';

type TrackedQuery = QueryEvent & {
    /** Merged from the initial POST + subsequent poll results */
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
    const chartVersion = trackedQueryToChartVersion(query);
    const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
        projectUuid,
        chartVersion,
    );
    return `${pathname}?${search}`;
};

const QueryRow: FC<{
    query: TrackedQuery;
    projectUuid: string;
    onHover?: (queryUuid: string | null) => void;
    focused?: boolean;
}> = ({ query, projectUuid, onHover, focused }) => {
    const [expanded, setExpanded] = useState(false);
    const [jsonExpanded, setJsonExpanded] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (focused) {
            setExpanded(true);
            rowRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [focused]);

    const exploreUrl = query.exploreName
        ? buildExploreUrl(projectUuid, query)
        : null;

    return (
        <Box
            ref={rowRef}
            className={`${classes.queryRow}${focused ? ` ${classes.queryRowFocused}` : ''}`}
            data-query-uuid={query.queryUuid ?? undefined}
            onMouseEnter={() => query.queryUuid && onHover?.(query.queryUuid)}
            onMouseLeave={() => onHover?.(null)}
        >
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
                        {query.exploreName && (
                            <Group gap="md" wrap="nowrap">
                                {exploreUrl && (
                                    <Anchor
                                        href={exploreUrl}
                                        target="_blank"
                                        size="xs"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Group gap={4} wrap="nowrap">
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size={12}
                                            />
                                            Open in Explore
                                        </Group>
                                    </Anchor>
                                )}
                                {query.rawMetricQuery && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        size="xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSaveOpen(true);
                                        }}
                                    >
                                        <Group gap={4} wrap="nowrap">
                                            <MantineIcon
                                                icon={IconDeviceFloppy}
                                                size={12}
                                            />
                                            Save to Lightdash
                                        </Group>
                                    </Anchor>
                                )}
                            </Group>
                        )}
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
            {saveOpen && query.rawMetricQuery && (
                <SaveQueryToLightdashModal
                    query={query}
                    projectUuid={projectUuid}
                    onClose={() => setSaveOpen(false)}
                />
            )}
        </Box>
    );
};

/**
 * Body of the "Queries" inspector tab: the scrollable list of tracked metric
 * queries. The panel chrome (container, tabs, resize, collapse) lives in
 * `AppInspectorPanel`.
 */
export const QueryInspectorContent: FC<{
    queries: TrackedQuery[];
    projectUuid: string;
    onHoverQuery?: (queryUuid: string | null) => void;
    focusedQueryUuid?: string | null;
}> = ({ queries, projectUuid, onHoverQuery, focusedQueryUuid }) => (
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
                    onHover={onHoverQuery}
                    focused={
                        focusedQueryUuid != null &&
                        q.queryUuid === focusedQueryUuid
                    }
                />
            ))
        )}
    </Box>
);

import {
    QueryHistoryStatus,
    QueryLanguage,
    type QueryHistoryListItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Skeleton,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowRight,
    IconChevronDown,
    IconChevronUp,
    IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import Callout from '../../../components/common/Callout';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../components/common/MantineIcon';
import TruncatedText from '../../../components/common/TruncatedText';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../../../ee/features/aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { AiAgentIcon } from '../../../ee/features/aiCopilot/components/AiAgentIcon';
import { useAiAgentButtonVisibility } from '../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import {
    DEFAULT_EMPTY_EXPLORE_CONFIG,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
import { useCancelQuery } from '../../../hooks/useQueryResults';
import { useQueryResultsPreview } from '../hooks/useQueryResultsPreview';
import { useRerunQuery, canRerunQuery } from '../hooks/useRerunQuery';
import styles from '../QueryHistory.module.css';
import {
    formatRunTime,
    formatWhen,
    getLanguageLabel,
    getTriggerLabel,
    isRunningStatus,
} from '../utils/format';
import { getQueryTimings } from '../utils/timings';
import { QueryStatusBadge } from './QueryHistoryQueryCell';

const RESULTS_PREVIEW_COLUMNS = 6;
const RESULTS_PREVIEW_ROWS = 8;
const RESULTS_SKELETON_DEFAULT_COLUMNS = 4;
const SQL_COLLAPSED_HEIGHT = 260;

type Props = {
    projectUuid: string | undefined;
    item: QueryHistoryListItem;
    onClose: () => void;
    onNavigate: (direction: -1 | 1) => void;
    canNavigateUp: boolean;
    canNavigateDown: boolean;
};

const TimingCell: FC<{
    label: string;
    value: number | null;
    muted?: boolean;
}> = ({ label, value, muted = false }) => (
    <Box p="sm" className={styles.timingCell}>
        <Text fz="xs" c="dimmed">
            {label}
        </Text>
        <Text ff="monospace" fw={600} c={muted ? 'dimmed' : undefined}>
            {formatRunTime(value)}
        </Text>
    </Box>
);

/**
 * Same Table props as the real preview so the skeleton is the height of the
 * table that replaces it; column and row counts come from the run itself.
 */
const ResultsSkeleton: FC<{ columns: number; rows: number }> = ({
    columns,
    rows,
}) => {
    const columnKeys = Array.from({ length: columns }, (_, i) => `c${i}`);
    return (
        <Paper className={styles.resultsTable} aria-busy>
            <Table fz="xs" verticalSpacing="xs" horizontalSpacing="sm">
                <Table.Thead>
                    <Table.Tr>
                        {columnKeys.map((key) => (
                            <Table.Th key={key}>
                                <Box className={styles.resultsSkeletonLine}>
                                    <Skeleton h={10} w="60%" radius="xl" />
                                </Box>
                            </Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {Array.from({ length: rows }, (_, rowIndex) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <Table.Tr key={rowIndex}>
                            {columnKeys.map((key, columnIndex) => (
                                <Table.Td key={key}>
                                    <Box className={styles.resultsSkeletonLine}>
                                        <Skeleton
                                            h={10}
                                            w={
                                                (rowIndex + columnIndex) % 2 ===
                                                0
                                                    ? '72%'
                                                    : '48%'
                                            }
                                            radius="xl"
                                            opacity={0.6}
                                        />
                                    </Box>
                                </Table.Td>
                            ))}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
};

const ResultsPlaceholder: FC<{ children: React.ReactNode }> = ({
    children,
}) => (
    <Paper variant="dotted" p="lg">
        <Group justify="center" gap="xs">
            {children}
        </Group>
    </Paper>
);

export const QueryHistoryDetailPanel: FC<Props> = ({
    projectUuid,
    item,
    onClose,
    onNavigate,
    canNavigateUp,
    canNavigateDown,
}) => {
    const navigate = useNavigate();
    const [aiPrompt, setAiPrompt] = useState('');
    const showAskAi = useAiAgentButtonVisibility();

    const running = isRunningStatus(item.status);
    const failed = item.status === QueryHistoryStatus.ERROR;
    const ready = item.status === QueryHistoryStatus.READY;

    const resultsPreviewQuery = useQueryResultsPreview(
        projectUuid,
        item.queryUuid,
        ready,
    );
    const resultsPage = resultsPreviewQuery.data;
    const readyResults =
        resultsPage?.status === QueryHistoryStatus.READY
            ? resultsPage
            : undefined;

    const rerunMutation = useRerunQuery(projectUuid);
    const { mutate: cancelQuery } = useCancelQuery(projectUuid, item.queryUuid);

    const timings = useMemo(() => getQueryTimings(item), [item]);

    const exploreUrl = useMemo(() => {
        if (!item.metricQuery || !item.exploreName) return null;
        const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            {
                ...DEFAULT_EMPTY_EXPLORE_CONFIG,
                tableName: item.exploreName,
                metricQuery: item.metricQuery,
            },
        );
        return pathname ? { pathname, search } : null;
    }, [item.metricQuery, item.exploreName, projectUuid]);

    const sqlLineCount = item.compiledSql.trim().split('\n').length;

    const columnIds = readyResults
        ? Object.keys(readyResults.columns).slice(0, RESULTS_PREVIEW_COLUMNS)
        : [];
    const previewRows = readyResults
        ? readyResults.rows.slice(0, RESULTS_PREVIEW_ROWS)
        : [];

    const submitAiPrompt = () => {
        const prompt = aiPrompt.trim();
        if (!prompt || !projectUuid) return;
        const context = `Regarding the results of my "${item.title}" query (${
            item.totalRowCount ?? 'unknown'
        } rows): ${prompt}`;
        void navigate(
            {
                pathname: `/projects/${projectUuid}/ai-agents`,
                search: new URLSearchParams({
                    [AI_ROUTING_SEARCH_PARAM]: AI_ROUTING_AUTO_VALUE,
                }).toString(),
            },
            { state: { autoSubmitPrompt: context } },
        );
    };

    const meta = [
        getTriggerLabel(item.trigger),
        formatWhen(item.createdAt),
        item.totalRowCount !== null
            ? `${item.totalRowCount.toLocaleString()} rows`
            : null,
        item.dashboardName,
    ]
        .filter(Boolean)
        .join(' · ');

    const resultsMeta = [
        item.totalRowCount !== null
            ? `${item.totalRowCount.toLocaleString()} rows`
            : null,
        item.resultsExpiresAt && dayjs(item.resultsExpiresAt).isAfter(dayjs())
            ? `cached until ${dayjs(item.resultsExpiresAt).format('HH:mm')}`
            : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const primaryCta = (() => {
        if (running) {
            return (
                <Button
                    size="xs"
                    color="red"
                    variant="light"
                    onClick={() => cancelQuery()}
                >
                    Cancel query
                </Button>
            );
        }
        if (item.language === QueryLanguage.SQL) {
            return (
                <Button
                    size="xs"
                    component={Link}
                    to={`/projects/${projectUuid}/sql-runner`}
                    state={{ sql: item.compiledSql }}
                    rightSection={
                        <MantineIcon icon={IconArrowRight} size="sm" />
                    }
                >
                    Open in SQL runner
                </Button>
            );
        }
        if (exploreUrl) {
            return (
                <Button
                    size="xs"
                    component={Link}
                    to={exploreUrl}
                    rightSection={
                        <MantineIcon icon={IconArrowRight} size="sm" />
                    }
                >
                    {failed ? 'Fix in Explore' : 'Open in Explore'}
                </Button>
            );
        }
        return null;
    })();

    const results = (() => {
        if (failed) {
            return (
                <Callout variant="danger">
                    <Text fz="xs" ff="monospace" className="ld-pre-wrap">
                        {item.error ?? 'Query failed'}
                    </Text>
                </Callout>
            );
        }
        if (running) {
            return (
                <ResultsPlaceholder>
                    <Loader size="xs" color="gray" />
                    <Text fz="sm" c="dimmed">
                        Query is still running
                    </Text>
                </ResultsPlaceholder>
            );
        }
        if (readyResults && columnIds.length > 0) {
            return (
                <Paper className={styles.resultsTable}>
                    <Table fz="xs" verticalSpacing="xs" horizontalSpacing="sm">
                        <Table.Thead>
                            <Table.Tr>
                                {columnIds.map((columnId) => (
                                    <Table.Th key={columnId}>
                                        {readyResults.columns[columnId]
                                            ?.reference ?? columnId}
                                    </Table.Th>
                                ))}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {previewRows.map((row, rowIndex) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <Table.Tr key={rowIndex}>
                                    {columnIds.map((columnId) => (
                                        <Table.Td key={columnId} ff="monospace">
                                            {row[columnId]?.value?.formatted ??
                                                ''}
                                        </Table.Td>
                                    ))}
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>
            );
        }
        if (resultsPreviewQuery.isInitialLoading) {
            const expectedColumns = item.metricQuery
                ? item.metricQuery.dimensions.length +
                  item.metricQuery.metrics.length +
                  item.metricQuery.tableCalculations.length
                : RESULTS_SKELETON_DEFAULT_COLUMNS;
            return (
                <ResultsSkeleton
                    columns={Math.min(
                        Math.max(expectedColumns, 1),
                        RESULTS_PREVIEW_COLUMNS,
                    )}
                    rows={Math.min(
                        item.totalRowCount ?? RESULTS_PREVIEW_ROWS,
                        RESULTS_PREVIEW_ROWS,
                    )}
                />
            );
        }
        return (
            <ResultsPlaceholder>
                <Text fz="sm" c="dimmed" ta="center">
                    Results are no longer available. Re-run the query to see
                    them.
                </Text>
            </ResultsPlaceholder>
        );
    })();

    return (
        <Box className={styles.panel}>
            <Group
                justify="space-between"
                align="flex-start"
                wrap="nowrap"
                gap="md"
                p="md"
                className={styles.panelHeader}
            >
                <Stack gap={4} miw={0}>
                    <Group gap="xs" wrap="nowrap" miw={0}>
                        <TruncatedText maxWidth="100%" fz="md" fw={600}>
                            {item.title}
                        </TruncatedText>
                        <Badge size="xs" className="ld-shrink-0">
                            {getLanguageLabel(item.language)}
                        </Badge>
                        <QueryStatusBadge status={item.status} />
                    </Group>
                    <Text fz="xs" c="dimmed">
                        {meta}
                    </Text>
                </Stack>
                <Group gap={4} wrap="nowrap">
                    <Tooltip label="Previous query">
                        <ActionIcon
                            aria-label="Previous query"
                            disabled={!canNavigateUp}
                            onClick={() => onNavigate(-1)}
                        >
                            <MantineIcon icon={IconChevronUp} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Next query">
                        <ActionIcon
                            aria-label="Next query"
                            disabled={!canNavigateDown}
                            onClick={() => onNavigate(1)}
                        >
                            <MantineIcon icon={IconChevronDown} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Close">
                        <ActionIcon aria-label="Close panel" onClick={onClose}>
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            <Box className={styles.panelBody}>
                <Stack p="md" gap="lg">
                    <Paper className={styles.timings}>
                        <TimingCell label="Total" value={timings.totalMs} />
                        <TimingCell
                            label="Queued"
                            value={timings.queuedMs}
                            muted
                        />
                        <TimingCell
                            label="Warehouse"
                            value={timings.warehouseMs}
                        />
                        <TimingCell
                            label="Fetch"
                            value={timings.fetchMs}
                            muted
                        />
                    </Paper>

                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Text fw={500}>Results</Text>
                            {resultsMeta ? (
                                <Text fz="xs" c="dimmed">
                                    {resultsMeta}
                                </Text>
                            ) : null}
                        </Group>
                        {results}
                    </Stack>

                    <Stack gap="xs">
                        <Group justify="space-between" wrap="nowrap">
                            <Text fw={500}>SQL</Text>
                            <Text fz="xs" c="dimmed">
                                {`${sqlLineCount} ${
                                    sqlLineCount === 1 ? 'line' : 'lines'
                                }`}
                            </Text>
                        </Group>
                        <Box className={styles.sql}>
                            <CodeBlock
                                code={item.compiledSql}
                                language="sql"
                                radius="md"
                                withExpandButton
                                defaultExpanded={false}
                                maxCollapsedHeight={SQL_COLLAPSED_HEIGHT}
                            />
                        </Box>
                    </Stack>
                </Stack>
            </Box>

            <Stack p="md" gap="sm" className={styles.panelFooter}>
                {showAskAi ? (
                    <TextInput
                        value={aiPrompt}
                        onChange={(event) =>
                            setAiPrompt(event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') submitAiPrompt();
                        }}
                        placeholder="Ask AI about these results"
                        leftSection={<AiAgentIcon size={14} />}
                    />
                ) : null}
                <Group justify="space-between">
                    <Button
                        variant="default"
                        size="xs"
                        loading={rerunMutation.isLoading}
                        disabled={!canRerunQuery(item)}
                        onClick={() => rerunMutation.mutate(item)}
                    >
                        Re-run
                    </Button>
                    {primaryCta}
                </Group>
            </Stack>
        </Box>
    );
};

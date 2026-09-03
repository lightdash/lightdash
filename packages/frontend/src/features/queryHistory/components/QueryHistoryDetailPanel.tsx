import {
    QueryHistoryStatus,
    QueryLanguage,
    type QueryHistoryListItem,
} from '@lightdash/common';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useMemo, useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../../../ee/features/aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { useAiAgentButtonVisibility } from '../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import {
    DEFAULT_EMPTY_EXPLORE_CONFIG,
    getExplorerUrlFromCreateSavedChartVersion,
} from '../../../hooks/useExplorerRoute';
import { useCancelQuery } from '../../../hooks/useQueryResults';
import { useQueryResultsPreview } from '../hooks/useQueryResultsPreview';
import { useRerunQuery, canRerunQuery } from '../hooks/useRerunQuery';
import styles from '../QueryHistory.module.css';
import { formatRunTime, formatWhen, getTriggerLabel } from '../utils/format';
import { getQueryTimings } from '../utils/timings';

const SQL_PREVIEW_LINES = 12;
const RESULTS_PREVIEW_COLUMNS = 6;
const RESULTS_PREVIEW_ROWS = 8;

const isRunning = (status: QueryHistoryStatus) =>
    status === QueryHistoryStatus.PENDING ||
    status === QueryHistoryStatus.QUEUED ||
    status === QueryHistoryStatus.EXECUTING;

type Props = {
    projectUuid: string | undefined;
    item: QueryHistoryListItem;
    onClose: () => void;
    onNavigate: (direction: -1 | 1) => void;
    canNavigateUp: boolean;
    canNavigateDown: boolean;
};

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

    const running = isRunning(item.status);
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

    const sqlLines = item.compiledSql.split('\n');
    const sqlPreview = sqlLines.slice(0, SQL_PREVIEW_LINES).join('\n');
    const sqlIsTruncated = sqlLines.length > SQL_PREVIEW_LINES;

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

    const primaryCta = (() => {
        if (running) {
            return (
                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => cancelQuery()}
                >
                    Cancel query
                </button>
            );
        }
        if (item.language === QueryLanguage.SQL) {
            return (
                <Link
                    className={styles.primaryButton}
                    to={`/projects/${projectUuid}/sql-runner`}
                    state={{ sql: item.compiledSql }}
                >
                    Open in SQL runner
                    <MantineIcon icon={IconArrowRight} size={13} />
                </Link>
            );
        }
        if (exploreUrl) {
            return (
                <Link className={styles.primaryButton} to={exploreUrl}>
                    {failed ? 'Fix in Explore' : 'Open in Explore'}
                    <MantineIcon icon={IconArrowRight} size={13} />
                </Link>
            );
        }
        return null;
    })();

    return (
        <div className={styles.panel}>
            <div className={styles.panelHeader}>
                <div className={styles.panelTitleWrap}>
                    <div className={styles.panelTitleLine}>
                        <span className={styles.panelTitle}>{item.title}</span>
                        <span
                            className={clsx(
                                styles.languageTag,
                                item.language === QueryLanguage.SQL
                                    ? styles.languageTagSql
                                    : styles.languageTagSemantic,
                            )}
                        >
                            {item.language === QueryLanguage.SQL
                                ? 'SQL'
                                : 'SEMANTIC'}
                        </span>
                    </div>
                    <div className={styles.panelMeta}>
                        {[
                            getTriggerLabel(item.trigger),
                            formatWhen(item.createdAt),
                            item.totalRowCount !== null
                                ? `${item.totalRowCount.toLocaleString()} rows`
                                : null,
                            item.dashboardName,
                        ]
                            .filter(Boolean)
                            .join(' · ')}
                    </div>
                </div>
                <div className={styles.panelNav}>
                    <button
                        type="button"
                        className={styles.panelNavButton}
                        onClick={() => onNavigate(-1)}
                        disabled={!canNavigateUp}
                        aria-label="Previous query"
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className={styles.panelNavButton}
                        onClick={() => onNavigate(1)}
                        disabled={!canNavigateDown}
                        aria-label="Next query"
                    >
                        ↓
                    </button>
                    <button
                        type="button"
                        className={styles.panelNavButton}
                        onClick={onClose}
                        aria-label="Close panel"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div className={styles.panelBody}>
                <div className={styles.timingStrip}>
                    <div className={styles.timingCell}>
                        <div className={styles.timingLabel}>Total</div>
                        <div className={styles.timingValue}>
                            {formatRunTime(timings.totalMs)}
                        </div>
                    </div>
                    <div className={styles.timingCell}>
                        <div className={styles.timingLabel}>Queued</div>
                        <div
                            className={clsx(
                                styles.timingValue,
                                styles.timingValueMuted,
                            )}
                        >
                            {formatRunTime(timings.queuedMs)}
                        </div>
                    </div>
                    <div className={styles.timingCell}>
                        <div className={styles.timingLabel}>Warehouse</div>
                        <div className={styles.timingValue}>
                            {formatRunTime(timings.warehouseMs)}
                        </div>
                    </div>
                    <div className={styles.timingCell}>
                        <div className={styles.timingLabel}>Fetch</div>
                        <div
                            className={clsx(
                                styles.timingValue,
                                styles.timingValueMuted,
                            )}
                        >
                            {formatRunTime(timings.fetchMs)}
                        </div>
                    </div>
                </div>

                <div>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionLabel}>Results</span>
                        <span className={styles.sectionMeta}>
                            {[
                                item.totalRowCount !== null
                                    ? `${item.totalRowCount.toLocaleString()} rows`
                                    : null,
                                item.resultsExpiresAt &&
                                dayjs(item.resultsExpiresAt).isAfter(dayjs())
                                    ? `cached until ${dayjs(
                                          item.resultsExpiresAt,
                                      ).format('HH:mm')}`
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                    </div>
                    {failed ? (
                        <div className={styles.errorBlock}>
                            {item.error ?? 'Query failed'}
                        </div>
                    ) : running ? (
                        <div className={styles.resultsPlaceholder}>
                            Query is still running…
                        </div>
                    ) : readyResults && columnIds.length > 0 ? (
                        <div className={styles.resultsTable}>
                            <table>
                                <thead>
                                    <tr>
                                        {columnIds.map((columnId) => (
                                            <th key={columnId}>
                                                {readyResults.columns[columnId]
                                                    ?.reference ?? columnId}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, rowIndex) => (
                                        // eslint-disable-next-line react/no-array-index-key
                                        <tr key={rowIndex}>
                                            {columnIds.map((columnId) => (
                                                <td key={columnId}>
                                                    {row[columnId]?.value
                                                        ?.formatted ?? ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : resultsPreviewQuery.isInitialLoading ? (
                        <div className={styles.resultsPlaceholder}>
                            Loading results…
                        </div>
                    ) : (
                        <div className={styles.resultsPlaceholder}>
                            Results are no longer available — re-run the query
                            to see them.
                        </div>
                    )}
                </div>

                <div>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionLabel}>SQL</span>
                        <button
                            type="button"
                            className={styles.sectionAction}
                            onClick={() =>
                                void navigator.clipboard.writeText(
                                    item.compiledSql,
                                )
                            }
                        >
                            Copy
                        </button>
                    </div>
                    <pre className={styles.sqlBlock}>{sqlPreview}</pre>
                    {sqlIsTruncated && (
                        <div className={styles.sqlTruncated}>
                            {`Truncated · ${sqlLines.length} lines`}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.panelFooter}>
                {showAskAi && (
                    <div className={styles.askAi}>
                        <MantineIcon
                            icon={IconSparkles}
                            size={14}
                            color="dimmed"
                        />
                        <input
                            value={aiPrompt}
                            onChange={(event) =>
                                setAiPrompt(event.currentTarget.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') submitAiPrompt();
                            }}
                            placeholder="Ask AI about these results…"
                        />
                    </div>
                )}
                <div className={styles.panelActions}>
                    <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={
                            rerunMutation.isLoading || !canRerunQuery(item)
                        }
                        onClick={() => rerunMutation.mutate(item)}
                    >
                        {rerunMutation.isLoading ? 'Re-running…' : 'Re-run'}
                    </button>
                    {primaryCta}
                </div>
            </div>
        </div>
    );
};

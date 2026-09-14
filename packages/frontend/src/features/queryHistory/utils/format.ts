import {
    QUERY_HISTORY_WINDOW_MINUTES,
    QUERY_HISTORY_WINDOWS_ORDERED,
    QueryHistoryStatus,
    QueryHistoryWindow,
    QueryLanguage,
    QueryTrigger,
    assertUnreachable,
} from '@lightdash/common';
import dayjs from 'dayjs';

/** "0.31s" under 10s, "14.8s" under 60s, "1m 12s" beyond. */
export const formatRunTime = (ms: number | null): string => {
    if (ms === null) return '—';
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(2)}s`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${minutes}m ${remainder}s`;
};

export const formatRowCount = (count: number | null): string =>
    count === null ? '—' : count.toLocaleString();

/** Relative inside the hour, clock time inside the day, then date. */
export const formatWhen = (createdAt: Date | string): string => {
    const created = dayjs(createdAt);
    const now = dayjs();
    const minutesAgo = now.diff(created, 'minute');
    if (minutesAgo < 1) return 'now';
    if (minutesAgo < 60) return `${minutesAgo} min ago`;
    if (now.diff(created, 'hour') < 24) return created.format('HH:mm');
    if (now.diff(created, 'day') < 7) return created.format('ddd HH:mm');
    return created.format('D MMM');
};

export const getWindowLabel = (window: QueryHistoryWindow): string => {
    switch (window) {
        case QueryHistoryWindow.LAST_FEW_MINUTES:
            return 'Last few minutes';
        case QueryHistoryWindow.LAST_HOUR:
            return 'Last hour';
        case QueryHistoryWindow.LAST_24_HOURS:
            return 'Last 24 hours';
        case QueryHistoryWindow.LAST_7_DAYS:
            return 'Last 7 days';
        case QueryHistoryWindow.LAST_30_DAYS:
            return 'Last 30 days';
        default:
            return assertUnreachable(window, 'Unknown query history window');
    }
};

/** Human range for a window header, e.g. "14:36 – 14:41" or "3 – 10 Aug". */
export const getWindowRangeLabel = (window: QueryHistoryWindow): string => {
    const index = QUERY_HISTORY_WINDOWS_ORDERED.indexOf(window);
    const from = dayjs().subtract(
        QUERY_HISTORY_WINDOW_MINUTES[window],
        'minute',
    );
    const to =
        index > 0
            ? dayjs().subtract(
                  QUERY_HISTORY_WINDOW_MINUTES[
                      QUERY_HISTORY_WINDOWS_ORDERED[index - 1]
                  ],
                  'minute',
              )
            : dayjs();

    switch (window) {
        case QueryHistoryWindow.LAST_FEW_MINUTES:
        case QueryHistoryWindow.LAST_HOUR:
            return `${from.format('HH:mm')} – ${to.format('HH:mm')}`;
        case QueryHistoryWindow.LAST_24_HOURS:
            return `Since ${from.format('ddd HH:mm')}`;
        case QueryHistoryWindow.LAST_7_DAYS:
        case QueryHistoryWindow.LAST_30_DAYS:
            return from.month() === to.month()
                ? `${from.format('D')} – ${to.format('D MMM')}`
                : `${from.format('D MMM')} – ${to.format('D MMM')}`;
        default:
            return assertUnreachable(window, 'Unknown query history window');
    }
};

/** "41 min", "2.4 h" or "38s" of warehouse time, for the page subtitle. */
export const formatWarehouseTime = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 120) return `${minutes} min`;
    return `${(minutes / 60).toFixed(1)} h`;
};

export const getTriggerLabel = (trigger: QueryTrigger): string => {
    switch (trigger) {
        case QueryTrigger.INTERACTIVE:
            return 'Interactive';
        case QueryTrigger.APPS:
            return 'Apps';
        case QueryTrigger.SCHEDULED:
            return 'Scheduled';
        default:
            return assertUnreachable(trigger, 'Unknown query trigger');
    }
};

export const isRunningStatus = (status: QueryHistoryStatus): boolean =>
    status === QueryHistoryStatus.PENDING ||
    status === QueryHistoryStatus.QUEUED ||
    status === QueryHistoryStatus.EXECUTING;

export const getLanguageLabel = (language: QueryLanguage): string =>
    language === QueryLanguage.SQL ? 'SQL' : 'Semantic';

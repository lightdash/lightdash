import {
    QueryHistoryStatus,
    QueryLanguage,
    type QueryHistoryListItem,
} from '@lightdash/common';
import clsx from 'clsx';
import { type FC } from 'react';
import styles from '../QueryHistory.module.css';
import {
    formatRowCount,
    formatRunTime,
    formatWhen,
    getTriggerLabel,
} from '../utils/format';

const isRunning = (status: QueryHistoryStatus) =>
    status === QueryHistoryStatus.PENDING ||
    status === QueryHistoryStatus.QUEUED ||
    status === QueryHistoryStatus.EXECUTING;

type Props = {
    item: QueryHistoryListItem;
    compact: boolean;
    isSelected: boolean;
    onSelect: (item: QueryHistoryListItem) => void;
};

export const QueryHistoryRow: FC<Props> = ({
    item,
    compact,
    isSelected,
    onSelect,
}) => {
    const running = isRunning(item.status);
    const failed = item.status === QueryHistoryStatus.ERROR;
    const sublineIsMono = item.language === QueryLanguage.SQL || failed;

    return (
        <button
            type="button"
            className={clsx(
                styles.row,
                compact && styles.rowCompact,
                isSelected && styles.rowSelected,
            )}
            onClick={() => onSelect(item)}
        >
            <div className={styles.rowMain}>
                <div className={styles.rowTitleLine}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    {running && (
                        <span
                            className={clsx(
                                styles.statusChip,
                                styles.statusChipRunning,
                            )}
                        >
                            <span className={styles.pulseDot} />
                            running
                        </span>
                    )}
                    {failed && (
                        <span
                            className={clsx(
                                styles.statusChip,
                                styles.statusChipFailed,
                            )}
                        >
                            failed
                        </span>
                    )}
                    {!running && !failed && item.cacheHit && (
                        <span
                            className={clsx(
                                styles.statusChip,
                                styles.statusChipCached,
                            )}
                        >
                            cached
                        </span>
                    )}
                </div>
                {item.subline && (
                    <div
                        className={clsx(
                            styles.rowSubline,
                            sublineIsMono && styles.rowSublineMono,
                            failed && styles.rowSublineError,
                        )}
                    >
                        {item.subline}
                    </div>
                )}
            </div>
            <span
                className={clsx(
                    styles.languageTag,
                    item.language === QueryLanguage.SQL
                        ? styles.languageTagSql
                        : styles.languageTagSemantic,
                )}
            >
                {item.language === QueryLanguage.SQL ? 'SQL' : 'SEMANTIC'}
            </span>
            {!compact && (
                <span className={styles.rowTrigger}>
                    {getTriggerLabel(item.trigger)}
                </span>
            )}
            <span
                className={clsx(
                    styles.rowRunTime,
                    (running || failed) && styles.rowRunTimeMuted,
                )}
            >
                {formatRunTime(item.warehouseExecutionTimeMs)}
            </span>
            {!compact && (
                <span
                    className={clsx(
                        styles.rowCount,
                        item.totalRowCount === null && styles.rowCountEmpty,
                    )}
                >
                    {formatRowCount(item.totalRowCount)}
                </span>
            )}
            <span className={styles.rowWhen}>{formatWhen(item.createdAt)}</span>
            <span className={styles.rowCta}>View results</span>
        </button>
    );
};

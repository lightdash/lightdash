import {
    QueryHistoryStatus,
    QueryLanguage,
    QueryTrigger,
    type QueryHistoryCounts,
} from '@lightdash/common';
import { Checkbox, Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import clsx from 'clsx';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from '../QueryHistory.module.css';
import { getTriggerLabel } from '../utils/format';

const TRIGGER_OPTIONS: (QueryTrigger | undefined)[] = [
    QueryTrigger.INTERACTIVE,
    QueryTrigger.APPS,
    QueryTrigger.SCHEDULED,
    undefined,
];

const LANGUAGE_OPTIONS: { value: QueryLanguage | undefined; label: string }[] =
    [
        { value: undefined, label: 'All' },
        { value: QueryLanguage.SEMANTIC, label: 'Semantic' },
        { value: QueryLanguage.SQL, label: 'SQL' },
    ];

const STATUS_OPTIONS: { value: QueryHistoryStatus; label: string }[] = [
    { value: QueryHistoryStatus.READY, label: 'Ready' },
    { value: QueryHistoryStatus.EXECUTING, label: 'Running' },
    { value: QueryHistoryStatus.QUEUED, label: 'Queued' },
    { value: QueryHistoryStatus.ERROR, label: 'Failed' },
    { value: QueryHistoryStatus.CANCELLED, label: 'Cancelled' },
    { value: QueryHistoryStatus.EXPIRED, label: 'Expired' },
];

type Props = {
    trigger: QueryTrigger | undefined;
    onTriggerChange: (trigger: QueryTrigger | undefined) => void;
    language: QueryLanguage | undefined;
    onLanguageChange: (language: QueryLanguage | undefined) => void;
    statuses: QueryHistoryStatus[];
    onStatusesChange: (statuses: QueryHistoryStatus[]) => void;
    counts: QueryHistoryCounts | undefined;
};

export const QueryHistoryToolbar: FC<Props> = ({
    trigger,
    onTriggerChange,
    language,
    onLanguageChange,
    statuses,
    onStatusesChange,
    counts,
}) => {
    return (
        <div className={styles.toolbar}>
            <div className={styles.segmented}>
                {TRIGGER_OPTIONS.map((option) => {
                    const count = option
                        ? counts?.triggers[option]
                        : counts?.total;
                    return (
                        <button
                            key={option ?? 'all'}
                            type="button"
                            className={clsx(
                                styles.segmentedOption,
                                trigger === option &&
                                    styles.segmentedOptionActive,
                            )}
                            onClick={() => onTriggerChange(option)}
                        >
                            {option ? getTriggerLabel(option) : 'All'}
                            {count !== undefined && (
                                <span className={styles.segmentedCount}>
                                    {count.toLocaleString()}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            <div className={styles.toolbarRight}>
                <div className={clsx(styles.segmented, styles.segmentedSmall)}>
                    {LANGUAGE_OPTIONS.map((option) => (
                        <button
                            key={option.label}
                            type="button"
                            className={clsx(
                                styles.segmentedOption,
                                language === option.value &&
                                    styles.segmentedOptionActive,
                            )}
                            onClick={() => onLanguageChange(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <Menu position="bottom-end" closeOnItemClick={false}>
                    <Menu.Target>
                        <button type="button" className={styles.statusButton}>
                            Status
                            {statuses.length > 0 && ` · ${statuses.length}`}
                            <MantineIcon
                                icon={IconChevronDown}
                                size={12}
                                color="dimmed"
                            />
                        </button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {STATUS_OPTIONS.map((option) => (
                            <Menu.Item
                                key={option.value}
                                onClick={() =>
                                    onStatusesChange(
                                        statuses.includes(option.value)
                                            ? statuses.filter(
                                                  (status) =>
                                                      status !== option.value,
                                              )
                                            : [...statuses, option.value],
                                    )
                                }
                                leftSection={
                                    <Checkbox
                                        size="xs"
                                        readOnly
                                        checked={statuses.includes(
                                            option.value,
                                        )}
                                    />
                                }
                            >
                                {option.label}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </div>
        </div>
    );
};

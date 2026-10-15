import {
    QueryHistoryStatus,
    QueryLanguage,
    QueryTrigger,
    type QueryHistoryCounts,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    SegmentedControl,
    Select,
    Skeleton,
    Text,
    useMatches,
} from '@mantine/core';
import {
    IconClock,
    IconLayoutDashboard,
    IconPointer,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentTableSearchInput } from '../../../components/common/ContentTable';
import FilterFacet from '../../../components/common/FilterFacet';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from '../QueryHistory.module.css';
import { getTriggerLabel } from '../utils/format';

const ALL_TRIGGERS = 'all';

const TRIGGER_OPTIONS: (QueryTrigger | undefined)[] = [
    QueryTrigger.INTERACTIVE,
    QueryTrigger.APPS,
    QueryTrigger.SCHEDULED,
    undefined,
];

const TRIGGER_ICONS: Record<QueryTrigger, TablerIcon> = {
    [QueryTrigger.INTERACTIVE]: IconPointer,
    [QueryTrigger.APPS]: IconLayoutDashboard,
    [QueryTrigger.SCHEDULED]: IconClock,
};

const isQueryTrigger = (value: string): value is QueryTrigger =>
    Object.values<string>(QueryTrigger).includes(value);

const isQueryLanguage = (value: string): value is QueryLanguage =>
    Object.values<string>(QueryLanguage).includes(value);

const isQueryHistoryStatus = (value: string): value is QueryHistoryStatus =>
    Object.values<string>(QueryHistoryStatus).includes(value);

const TriggerLabel: FC<{
    icon: TablerIcon | undefined;
    label: string;
    count: number | undefined;
}> = ({ icon, label, count }) => (
    <Group gap={6} wrap="nowrap">
        {icon ? <MantineIcon icon={icon} size="sm" color="dimmed" /> : null}
        <span>{label}</span>
        {count !== undefined ? (
            <Text component="span" fz="xs" c="dimmed">
                {count.toLocaleString()}
            </Text>
        ) : (
            <Box component="span" className={styles.countSkeleton}>
                <Skeleton h={8} w={18} radius="xl" />
            </Box>
        )}
    </Group>
);

type Props = {
    trigger: QueryTrigger | undefined;
    onTriggerChange: (trigger: QueryTrigger | undefined) => void;
    language: QueryLanguage | undefined;
    onLanguageChange: (language: QueryLanguage | undefined) => void;
    statuses: QueryHistoryStatus[];
    onStatusesChange: (statuses: QueryHistoryStatus[]) => void;
    counts: QueryHistoryCounts | undefined;
    search: string;
    onSearchChange: (search: string) => void;
};

export const QueryHistoryToolbar: FC<Props> = ({
    trigger,
    onTriggerChange,
    language,
    onLanguageChange,
    statuses,
    onStatusesChange,
    counts,
    search,
    onSearchChange,
}) => {
    const { t } = useTranslation('queryHistory');
    const languageOptions = useMemo(
        () => [
            { value: QueryLanguage.SEMANTIC, label: t('languages.semantic') },
            { value: QueryLanguage.SQL, label: t('languages.sql') },
        ],
        [t],
    );
    const statusOptions = useMemo(
        () => [
            { value: QueryHistoryStatus.READY, label: t('statuses.ready') },
            {
                value: QueryHistoryStatus.EXECUTING,
                label: t('statuses.running'),
            },
            { value: QueryHistoryStatus.QUEUED, label: t('statuses.queued') },
            { value: QueryHistoryStatus.ERROR, label: t('statuses.failed') },
            {
                value: QueryHistoryStatus.CANCELLED,
                label: t('statuses.cancelled'),
            },
            { value: QueryHistoryStatus.EXPIRED, label: t('statuses.expired') },
        ],
        [t],
    );
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    const hasRefinements =
        language !== undefined || statuses.length > 0 || search.length > 0;

    return (
        <Group
            justify="space-between"
            wrap="nowrap"
            gap="md"
            px="md"
            py="sm"
            className={styles.toolbar}
        >
            <Group gap="xs" wrap="nowrap" className={styles.toolbarFilters}>
                {compact ? (
                    <Select
                        aria-label={t('toolbar.querySource')}
                        w="100%"
                        value={trigger ?? ALL_TRIGGERS}
                        allowDeselect={false}
                        onChange={(value) =>
                            onTriggerChange(
                                value && isQueryTrigger(value)
                                    ? value
                                    : undefined,
                            )
                        }
                        data={TRIGGER_OPTIONS.map((option) => {
                            const count = option
                                ? counts?.triggers[option]
                                : counts?.total;
                            const label = option
                                ? getTriggerLabel(option)
                                : t('triggers.all');
                            return {
                                value: option ?? ALL_TRIGGERS,
                                label:
                                    count === undefined
                                        ? label
                                        : t('triggers.allWithCount', {
                                              label,
                                              count: count.toLocaleString(),
                                          }),
                            };
                        })}
                    />
                ) : (
                    <SegmentedControl
                        size="xs"
                        value={trigger ?? ALL_TRIGGERS}
                        onChange={(value) =>
                            onTriggerChange(
                                isQueryTrigger(value) ? value : undefined,
                            )
                        }
                        data={TRIGGER_OPTIONS.map((option) => ({
                            value: option ?? ALL_TRIGGERS,
                            label: (
                                <TriggerLabel
                                    icon={
                                        option
                                            ? TRIGGER_ICONS[option]
                                            : undefined
                                    }
                                    label={
                                        option
                                            ? getTriggerLabel(option)
                                            : t('triggers.all')
                                    }
                                    count={
                                        option
                                            ? counts?.triggers[option]
                                            : counts?.total
                                    }
                                />
                            ),
                        }))}
                    />
                )}
                <FilterFacet
                    label={t('toolbar.language')}
                    mode="single"
                    clearable
                    selected={language ? [language] : []}
                    onChange={(values) => {
                        const next = values[0];
                        onLanguageChange(
                            next !== undefined && isQueryLanguage(next)
                                ? next
                                : undefined,
                        );
                    }}
                    options={languageOptions}
                />
                <FilterFacet
                    label={t('toolbar.status')}
                    clearable
                    selected={statuses}
                    onChange={(values) =>
                        onStatusesChange(values.filter(isQueryHistoryStatus))
                    }
                    options={statusOptions}
                />
                {hasRefinements ? (
                    <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => {
                            onLanguageChange(undefined);
                            onStatusesChange([]);
                            onSearchChange('');
                        }}
                    >
                        {t('toolbar.clear')}
                    </Button>
                ) : null}
            </Group>
            <ContentTableSearchInput
                aria-label={t('toolbar.searchPlaceholder')}
                w={compact ? '100%' : undefined}
                collapsedWidth={compact ? '100%' : undefined}
                expandedWidth={compact ? '100%' : undefined}
                value={search}
                onChange={onSearchChange}
                placeholder={t('toolbar.searchPlaceholder')}
            />
        </Group>
    );
};

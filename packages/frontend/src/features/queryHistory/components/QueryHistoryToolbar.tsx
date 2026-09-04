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
    Skeleton,
    Text,
} from '@mantine/core';
import {
    IconClock,
    IconLayoutDashboard,
    IconPointer,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
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

const LANGUAGE_OPTIONS = [
    { value: QueryLanguage.SEMANTIC, label: 'Semantic' },
    { value: QueryLanguage.SQL, label: 'SQL' },
];

const STATUS_OPTIONS = [
    { value: QueryHistoryStatus.READY, label: 'Ready' },
    { value: QueryHistoryStatus.EXECUTING, label: 'Running' },
    { value: QueryHistoryStatus.QUEUED, label: 'Queued' },
    { value: QueryHistoryStatus.ERROR, label: 'Failed' },
    { value: QueryHistoryStatus.CANCELLED, label: 'Cancelled' },
    { value: QueryHistoryStatus.EXPIRED, label: 'Expired' },
];

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
            <Group gap="xs" wrap="nowrap">
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
                                    option ? TRIGGER_ICONS[option] : undefined
                                }
                                label={option ? getTriggerLabel(option) : 'All'}
                                count={
                                    option
                                        ? counts?.triggers[option]
                                        : counts?.total
                                }
                            />
                        ),
                    }))}
                />
                <FilterFacet
                    label="Language"
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
                    options={LANGUAGE_OPTIONS}
                />
                <FilterFacet
                    label="Status"
                    clearable
                    selected={statuses}
                    onChange={(values) =>
                        onStatusesChange(values.filter(isQueryHistoryStatus))
                    }
                    options={STATUS_OPTIONS}
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
                        Clear
                    </Button>
                ) : null}
            </Group>
            <ContentTableSearchInput
                value={search}
                onChange={onSearchChange}
                placeholder="Search fields, tables or SQL"
            />
        </Group>
    );
};

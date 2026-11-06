import {
    assertUnreachable,
    ResultsCacheStatsMissReason,
    type ResultsCacheRecommendationTarget,
    type ResultsCacheStats,
    type ResultsCacheStatsDays,
} from '@lightdash/common';
import {
    Anchor,
    Collapse,
    Divider,
    Group,
    Skeleton,
    Box,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import {
    useResultsCacheStats,
    useResultsCacheTtlProjections,
} from '../../hooks/useProjectResultsCacheSettings';
import { BigNumberDisplay } from '../common/BigNumber/BigNumberDisplay';
import InlineErrorState from '../common/InlineErrorState';
import MantineIcon from '../common/MantineIcon';
import { PolymorphicGroupButton } from '../common/PolymorphicGroupButton';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { formatCacheDuration } from './formatCacheDuration';
import { formatWarehouseTime } from './formatWarehouseTime';
import classes from './ResultsCacheStatsCard.module.css';

const formatPercent = (rate: number | null) =>
    rate === null ? 'n/a' : `${Math.round(rate * 100)}%`;

const reasonLabel = (reason: ResultsCacheStatsMissReason): string => {
    switch (reason) {
        case ResultsCacheStatsMissReason.EXPIRED:
            return 'Expired';
        case ResultsCacheStatsMissReason.CLEARED:
            return 'Cleared';
        case ResultsCacheStatsMissReason.SCHEDULED_REFRESH:
            return 'Scheduled refresh';
        default:
            return assertUnreachable(reason, 'Unknown miss reason');
    }
};

const reasonFix = (reason: ResultsCacheStatsMissReason): string => {
    switch (reason) {
        case ResultsCacheStatsMissReason.EXPIRED:
            return 'Raise the cache duration below.';
        case ResultsCacheStatsMissReason.CLEARED:
            return 'Clear only what changed, such as specific explores or tables.';
        case ResultsCacheStatsMissReason.SCHEDULED_REFRESH:
            return 'Turn on "Use cached results" for these deliveries and syncs.';
        default:
            return assertUnreachable(reason, 'Unknown miss reason');
    }
};

const targetPath = (
    projectUuid: string,
    target: ResultsCacheRecommendationTarget,
): string => {
    switch (target.kind) {
        case 'chart':
            return `/projects/${projectUuid}/saved/${target.chartUuid}`;
        case 'sqlChart':
            return `/projects/${projectUuid}/sql-runner/${target.slug}`;
        case 'explore':
            return `/projects/${projectUuid}/tables/${target.exploreName}`;
        default:
            return assertUnreachable(target, 'Unknown recommendation target');
    }
};

const targetId = (target: ResultsCacheRecommendationTarget): string => {
    switch (target.kind) {
        case 'chart':
            return target.chartUuid;
        case 'sqlChart':
            return target.savedSqlUuid;
        case 'explore':
            return target.exploreName;
        default:
            return assertUnreachable(target, 'Unknown recommendation target');
    }
};

const DAYS_OPTIONS = [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
];

const STAT_TILE_HEIGHT = 80;

type StatProps = { label: string; value: string };

const ESTIMATE_VALUE_COLOR = 'var(--estimate-ink)';

const Stat: FC<StatProps & { valueColor: string | null }> = ({
    label,
    value,
    valueColor,
}) => (
    <Box h={STAT_TILE_HEIGHT}>
        <BigNumberDisplay
            value={value}
            label={label}
            showLabel
            comparison={undefined}
            flipColors={false}
            valueColor={valueColor ?? undefined}
        />
    </Box>
);

const StatsSkeleton: FC<{ columns: number; withFooter: boolean }> = ({
    columns,
    withFooter,
}) => (
    <Stack gap="lg">
        <SimpleGrid cols={columns} spacing="md">
            {Array.from({ length: columns }, (_, index) => (
                <Skeleton key={index} h={STAT_TILE_HEIGHT} radius="md" />
            ))}
        </SimpleGrid>
        {withFooter && (
            <>
                <Divider />
                <Skeleton h={16} w="50%" radius="sm" />
            </>
        )}
    </Stack>
);

const pluralizeMisses = (count: number) =>
    `${count.toLocaleString()} avoidable ${count === 1 ? 'miss' : 'misses'}`;

type RecommendationsProps = {
    projectUuid: string;
    stats: ResultsCacheStats;
};

const Recommendations: FC<RecommendationsProps> = ({ projectUuid, stats }) => {
    const [opened, setOpened] = useState(false);

    if (stats.recommendations.length === 0) {
        return (
            <Text c="dimmed" fz="sm">
                No avoidable misses. Remaining misses are within the normal
                range.
            </Text>
        );
    }

    const toggle = () => setOpened((value) => !value);

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
                <PolymorphicGroupButton
                    component="div"
                    gap="xs"
                    wrap="nowrap"
                    onClick={toggle}
                >
                    <MantineIcon
                        icon={opened ? IconChevronDown : IconChevronRight}
                    />
                    <Text fz="sm" fw={500}>
                        {`${pluralizeMisses(stats.summary.avoidableMisses)} · ${formatWarehouseTime(
                            Math.round(stats.summary.avoidableWarehouseTimeMs),
                        )} of warehouse time`}
                    </Text>
                </PolymorphicGroupButton>
                <Anchor
                    component="button"
                    type="button"
                    fz="sm"
                    aria-expanded={opened}
                    onClick={toggle}
                >
                    {opened ? 'Hide recommendations' : 'View recommendations'}
                </Anchor>
            </Group>
            <Collapse expanded={opened}>
                <Table fz="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Chart</Table.Th>
                            <Table.Th>Reason</Table.Th>
                            <Table.Th>Misses</Table.Th>
                            <Table.Th>Warehouse time</Table.Th>
                            <Table.Th>Suggested fix</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {stats.recommendations.map((row) => (
                            <Table.Tr
                                key={`${row.reason}-${row.target.kind}-${targetId(row.target)}`}
                            >
                                <Table.Td>
                                    <Anchor
                                        component={Link}
                                        to={targetPath(projectUuid, row.target)}
                                        fz="sm"
                                    >
                                        {row.target.name}
                                    </Anchor>
                                </Table.Td>
                                <Table.Td>{reasonLabel(row.reason)}</Table.Td>
                                <Table.Td>
                                    {row.misses.toLocaleString()}
                                </Table.Td>
                                <Table.Td>
                                    {formatWarehouseTime(
                                        Math.round(row.warehouseTimeMs),
                                    )}
                                </Table.Td>
                                <Table.Td>{reasonFix(row.reason)}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Collapse>
        </Stack>
    );
};

type StatsContentProps = {
    projectUuid: string;
    stats: ResultsCacheStats;
};

const StatsContent: FC<StatsContentProps> = ({ projectUuid, stats }) => {
    const items: StatProps[] = [
        { label: 'Hit rate', value: formatPercent(stats.summary.hitRate) },
        { label: 'Hits', value: stats.summary.hits.toLocaleString() },
        { label: 'Misses', value: stats.summary.misses.toLocaleString() },
        {
            label: 'Warehouse time saved',
            value: formatWarehouseTime(
                Math.round(stats.summary.warehouseTimeSavedMs),
            ),
        },
    ];

    return (
        <Stack gap="lg">
            <SimpleGrid cols={4} spacing="md">
                {items.map((item) => (
                    <Stat
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        valueColor={null}
                    />
                ))}
            </SimpleGrid>

            <Divider />

            <Recommendations projectUuid={projectUuid} stats={stats} />
        </Stack>
    );
};

type UsageProps = {
    projectUuid: string;
    days: ResultsCacheStatsDays;
};

const ActualUsage: FC<UsageProps> = ({ projectUuid, days }) => {
    const {
        data: stats,
        isLoading,
        isError,
    } = useResultsCacheStats(projectUuid, days);

    if (isError) {
        return (
            <InlineErrorState message="Couldn't load usage stats. Try again later." />
        );
    }
    if (isLoading || !stats) return <StatsSkeleton columns={4} withFooter />;
    if (stats.summary.runs === 0) {
        return (
            <Text c="dimmed" fz="sm">
                No queries ran in this period.
            </Text>
        );
    }
    return <StatsContent projectUuid={projectUuid} stats={stats} />;
};

const EstimatedUsage: FC<UsageProps> = ({ projectUuid, days }) => {
    const {
        data: estimate,
        isLoading,
        isError,
    } = useResultsCacheTtlProjections(projectUuid, days);

    if (isError) {
        return (
            <InlineErrorState message="Couldn't estimate the benefit of caching. Try again later." />
        );
    }
    if (isLoading || !estimate)
        return <StatsSkeleton columns={3} withFooter={false} />;
    if (estimate.kind === 'tooManyRuns') {
        return (
            <Text c="dimmed" fz="sm">
                Too many queries ran in this period to estimate the benefit of
                caching.
            </Text>
        );
    }
    if (estimate.baseline.runs === 0) {
        return (
            <Text c="dimmed" fz="sm">
                No queries ran in this period.
            </Text>
        );
    }

    const { baseline } = estimate;
    const items: StatProps[] = [
        { label: 'Estimated hit rate', value: formatPercent(baseline.hitRate) },
        {
            label: 'Queries served from cache',
            value: baseline.hits.toLocaleString(),
        },
        {
            label: 'Warehouse time saved',
            value: formatWarehouseTime(
                Math.round(baseline.warehouseTimeSavedMs),
            ),
        },
    ];

    return (
        <Stack gap="lg">
            <SimpleGrid cols={3} spacing="md">
                {items.map((item) => (
                    <Stat
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        valueColor={ESTIMATE_VALUE_COLOR}
                    />
                ))}
            </SimpleGrid>
            <Text c="dimmed" fz="xs">
                {`Estimated by replaying the ${baseline.runs.toLocaleString()} queries from this period with a ${formatCacheDuration(
                    estimate.currentTtlSeconds,
                )} cache duration.`}
            </Text>
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    cacheEnabled: boolean;
    days: ResultsCacheStatsDays;
    onDaysChange: (days: ResultsCacheStatsDays) => void;
};

export const ResultsCacheStatsCard: FC<Props> = ({
    projectUuid,
    cacheEnabled,
    days,
    onDaysChange,
}) => (
    <SettingsCard
        {...(cacheEnabled
            ? {}
            : {
                  className: classes.estimate,
                  bg: 'var(--estimate-bg)',
                  withBorder: false,
              })}
    >
        <Stack gap="lg">
            <Group justify="space-between" wrap="nowrap">
                <Title
                    order={5}
                    className={cacheEnabled ? undefined : classes.estimateTitle}
                >
                    {cacheEnabled ? 'Usage' : 'Estimated savings'}
                </Title>
                <SegmentedControl
                    size="xs"
                    data={DAYS_OPTIONS}
                    value={String(days)}
                    onChange={(value) => onDaysChange(value === '30' ? 30 : 7)}
                />
            </Group>
            {cacheEnabled ? (
                <ActualUsage projectUuid={projectUuid} days={days} />
            ) : (
                <EstimatedUsage projectUuid={projectUuid} days={days} />
            )}
        </Stack>
    </SettingsCard>
);

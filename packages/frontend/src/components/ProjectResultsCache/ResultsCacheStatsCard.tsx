import {
    assertUnreachable,
    ResultsCacheStatsContextGroup,
    ResultsCacheStatsMissReason,
    type ResultsCacheRecommendationTarget,
    type ResultsCacheStats,
    type ResultsCacheStatsDays,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Collapse,
    Divider,
    Group,
    Loader,
    SegmentedControl,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { Fragment, useState, type FC } from 'react';
import { Link } from 'react-router';
import { useResultsCacheStats } from '../../hooks/useProjectResultsCacheSettings';
import InlineErrorState from '../common/InlineErrorState';
import MantineIcon from '../common/MantineIcon';
import { PolymorphicGroupButton } from '../common/PolymorphicGroupButton';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { formatWarehouseTime } from './formatWarehouseTime';
import classes from './ResultsCacheStatsCard.module.css';

const formatPercent = (rate: number | null) =>
    rate === null ? 'n/a' : `${Math.round(rate * 100)}%`;

const contextLabel = (group: ResultsCacheStatsContextGroup): string => {
    switch (group) {
        case ResultsCacheStatsContextGroup.DASHBOARDS:
            return 'Dashboards';
        case ResultsCacheStatsContextGroup.CHARTS_AND_EXPLORE:
            return 'Charts and explore';
        case ResultsCacheStatsContextGroup.SCHEDULED:
            return 'Scheduled deliveries and syncs';
        case ResultsCacheStatsContextGroup.OTHER:
            return 'API and other';
        default:
            return assertUnreachable(group, 'Unknown context group');
    }
};

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

const STATS_COLUMN_WIDTH = '20%';

type StatProps = { label: string; value: string };

const Stat: FC<StatProps> = ({ label, value }) => (
    <Box flex={1}>
        <Text c="dimmed" fz="sm" className={classes.statLabel}>
            {label}
        </Text>
        <Text fw={600} fz="xl">
            {value}
        </Text>
    </Box>
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
                <Stack gap="xs">
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
                                            to={targetPath(
                                                projectUuid,
                                                row.target,
                                            )}
                                            fz="sm"
                                        >
                                            {row.target.name}
                                        </Anchor>
                                    </Table.Td>
                                    <Table.Td>
                                        {reasonLabel(row.reason)}
                                    </Table.Td>
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
                    <Text c="dimmed" fz="xs">
                        Misses from before reasons were recorded are counted but
                        never listed.
                    </Text>
                </Stack>
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
            <Group gap="lg" wrap="nowrap" align="stretch">
                {items.map((item, index) => (
                    <Fragment key={item.label}>
                        {index > 0 && <Divider orientation="vertical" />}
                        <Stat label={item.label} value={item.value} />
                    </Fragment>
                ))}
            </Group>

            <Table fz="sm">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Source</Table.Th>
                        <Table.Th w={STATS_COLUMN_WIDTH}>Runs</Table.Th>
                        <Table.Th w={STATS_COLUMN_WIDTH}>Hit rate</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {stats.byContext.map((row) => (
                        <Table.Tr key={row.group}>
                            <Table.Td>{contextLabel(row.group)}</Table.Td>
                            <Table.Td>{row.runs.toLocaleString()}</Table.Td>
                            <Table.Td>{formatPercent(row.hitRate)}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>

            <Divider />

            <Recommendations projectUuid={projectUuid} stats={stats} />
        </Stack>
    );
};

type Props = {
    projectUuid: string;
    days: ResultsCacheStatsDays;
    onDaysChange: (days: ResultsCacheStatsDays) => void;
};

export const ResultsCacheStatsCard: FC<Props> = ({
    projectUuid,
    days,
    onDaysChange,
}) => {
    const {
        data: stats,
        isLoading,
        isError,
    } = useResultsCacheStats(projectUuid, days);

    const renderContent = () => {
        if (isError) {
            return (
                <InlineErrorState message="Couldn't load usage stats. Try again later." />
            );
        }
        if (isLoading || !stats) return <Loader size="sm" />;
        if (stats.summary.runs === 0) {
            return (
                <Text c="dimmed" fz="sm">
                    No queries ran in this period.
                </Text>
            );
        }
        return <StatsContent projectUuid={projectUuid} stats={stats} />;
    };

    return (
        <SettingsCard>
            <Stack gap="lg">
                <Group justify="space-between" wrap="nowrap">
                    <Title order={5}>Usage</Title>
                    <SegmentedControl
                        size="xs"
                        data={DAYS_OPTIONS}
                        value={String(days)}
                        onChange={(value) =>
                            onDaysChange(value === '30' ? 30 : 7)
                        }
                    />
                </Group>
                {renderContent()}
            </Stack>
        </SettingsCard>
    );
};

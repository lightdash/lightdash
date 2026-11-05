import {
    assertUnreachable,
    ResultsCacheStatsContextGroup,
    ResultsCacheStatsMissReason,
    type ResultsCacheRecommendationTarget,
    type ResultsCacheStatsDays,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Loader,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { useResultsCacheStats } from '../../hooks/useProjectResultsCacheSettings';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import { formatWarehouseTime } from './formatWarehouseTime';

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

type StatProps = { label: string; value: string };

const Stat: FC<StatProps> = ({ label, value }) => (
    <Box>
        <Text c="dimmed" fz="xs">
            {label}
        </Text>
        <Text fw={600} fz="lg">
            {value}
        </Text>
    </Box>
);

type Props = {
    projectUuid: string;
};

export const ResultsCacheStatsCard: FC<Props> = ({ projectUuid }) => {
    const [days, setDays] = useState<ResultsCacheStatsDays>(7);
    const {
        data: stats,
        isLoading,
        isError,
    } = useResultsCacheStats(projectUuid, days);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>Usage</Title>
                <Text c="dimmed" fz="xs">
                    How often queries were served from the cache, and what to
                    change to get more hits.
                </Text>
            </Box>
            <Stack gap="md">
                <SegmentedControl
                    size="xs"
                    data={DAYS_OPTIONS}
                    value={String(days)}
                    onChange={(value) => setDays(value === '30' ? 30 : 7)}
                />
                {isError ? (
                    <Text c="dimmed" fz="sm">
                        Couldn't load usage stats. Try again later.
                    </Text>
                ) : isLoading || !stats ? (
                    <Loader size="sm" />
                ) : stats.summary.runs === 0 ? (
                    <Text c="dimmed" fz="sm">
                        No queries ran in this period.
                    </Text>
                ) : (
                    <>
                        <SimpleGrid cols={4}>
                            <Stat
                                label="Hit rate"
                                value={formatPercent(stats.summary.hitRate)}
                            />
                            <Stat
                                label="Hits"
                                value={stats.summary.hits.toLocaleString()}
                            />
                            <Stat
                                label="Misses"
                                value={stats.summary.misses.toLocaleString()}
                            />
                            <Stat
                                label="Warehouse time saved"
                                value={formatWarehouseTime(
                                    Math.round(
                                        stats.summary.warehouseTimeSavedMs,
                                    ),
                                )}
                            />
                        </SimpleGrid>

                        <Table fz="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Source</Table.Th>
                                    <Table.Th>Runs</Table.Th>
                                    <Table.Th>Hit rate</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {stats.byContext.map((row) => (
                                    <Table.Tr key={row.group}>
                                        <Table.Td>
                                            {contextLabel(row.group)}
                                        </Table.Td>
                                        <Table.Td>
                                            {row.runs.toLocaleString()}
                                        </Table.Td>
                                        <Table.Td>
                                            {formatPercent(row.hitRate)}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>

                        <Text fw={500} fz="sm">
                            Recommendations
                        </Text>
                        {stats.recommendations.length === 0 ? (
                            <Text c="dimmed" fz="xs">
                                Remaining misses are within the normal range.
                            </Text>
                        ) : (
                            <>
                                <Text c="dimmed" fz="xs">
                                    {`${stats.summary.avoidableMisses.toLocaleString()} misses (${formatWarehouseTime(
                                        Math.round(
                                            stats.summary
                                                .avoidableWarehouseTimeMs,
                                        ),
                                    )} of warehouse time) could have been served from the cache.`}
                                </Text>
                                <Table fz="xs">
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
                                                        fz="xs"
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
                                                        Math.round(
                                                            row.warehouseTimeMs,
                                                        ),
                                                    )}
                                                </Table.Td>
                                                <Table.Td>
                                                    {reasonFix(row.reason)}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </>
                        )}
                        <Text c="dimmed" fz="xs">
                            Misses from before reasons were recorded are counted
                            but never listed.
                        </Text>
                    </>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

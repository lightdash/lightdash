import { Group, Loader, Paper, ScrollArea, Table, Text } from '@mantine/core';
import { useState } from 'react';
import classes from './AnalyticsAdoption.module.css';
import {
    adoptionFeatures,
    adoptionRecency,
    adoptionRoles,
    type AdoptionData,
} from './analyticsAdoptionData';
import { formatAnalyticsNumber } from './analyticsOverviewConfig';

const details = {
    features: {
        title: 'Feature fingerprint',
        columns: [...adoptionFeatures],
        caption:
            'Share of members who used each feature in the last 30 complete days.',
    },
    recency: {
        title: 'Recent activity',
        columns: [
            ...adoptionRecency.map(({ label }) => label),
            'Active in 30 days',
        ],
        caption: 'Share of members by when they were last active.',
    },
    role: {
        title: 'Roles',
        columns: adoptionRoles.map(({ label }) => label),
        caption: 'Share of members by organization role.',
    },
    growth: {
        title: 'Growth status',
        columns: ['Lost', 'Gained', 'Net change', 'Gained per lost'],
        caption:
            'Compares feature usage in the last 28 complete days with the previous 28 days.',
    },
};

export type AdoptionColorMode = keyof typeof details;

const percentage = (count: number, total: number) =>
    total > 0 ? `${Math.round((100 * count) / total)}%` : '—';

const getValues = (
    mode: AdoptionColorMode,
    row: AdoptionData['overall'],
): string[] => {
    if (mode === 'growth') {
        const gained = row.growth[1] + row.growth[2];
        const lost = row.growth[3];
        const net = gained - lost;
        return [
            formatAnalyticsNumber(lost),
            formatAnalyticsNumber(gained),
            `${net > 0 ? '+' : ''}${formatAnalyticsNumber(net)}`,
            lost > 0
                ? (gained / lost).toFixed(1)
                : gained > 0
                  ? 'None lost'
                  : '—',
        ];
    }
    const counts =
        mode === 'features'
            ? row.featureCounts
            : mode === 'role'
              ? row.roles
              : [...row.recency, row.recency[0] + row.recency[1]];
    return counts.map((count) => percentage(count, row.total));
};

export const AnalyticsAdoptionDetails = ({
    mode,
    data,
    teams,
    includeOverall,
    loading,
}: {
    mode: AdoptionColorMode;
    data: AdoptionData | null;
    teams: AdoptionData['groups'];
    includeOverall: boolean;
    loading: boolean;
}) => {
    const [expanded, setExpanded] = useState(false);
    const { title, columns, caption } = details[mode];
    const rows =
        data && includeOverall
            ? [{ id: 'everyone', name: 'Everyone', ...data.overall }, ...teams]
            : teams;
    return (
        <Paper withBorder p="md">
            <details
                className={classes.fingerprint}
                onToggle={(event) => setExpanded(event.currentTarget.open)}
            >
                <Text component="summary" fw={600} size="sm">
                    {title}
                </Text>
                {expanded &&
                    (loading ? (
                        <Group
                            justify="center"
                            mih={100}
                            role="status"
                            aria-label={`Loading ${title.toLowerCase()}`}
                        >
                            <Loader size="sm" aria-hidden="true" />
                        </Group>
                    ) : rows.length === 0 ? (
                        <Text c="dimmed" size="sm">
                            {data
                                ? 'No members match these teams.'
                                : 'Feature usage is unavailable.'}
                        </Text>
                    ) : (
                        <ScrollArea>
                            <Table
                                withRowBorders
                                highlightOnHover
                                miw={mode === 'features' ? 730 : 580}
                            >
                                <Table.Caption>{caption}</Table.Caption>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Team</Table.Th>
                                        {columns.map((column) => (
                                            <Table.Th key={column}>
                                                {column}
                                            </Table.Th>
                                        ))}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {rows.map((row) => (
                                        <Table.Tr key={row.id}>
                                            <Table.Th scope="row">
                                                <Text size="sm" fw={600}>
                                                    {row.name}
                                                </Text>
                                                <Text c="dimmed" size="xs">
                                                    {formatAnalyticsNumber(
                                                        row.total,
                                                    )}{' '}
                                                    {row.total === 1
                                                        ? 'member'
                                                        : 'members'}
                                                </Text>
                                            </Table.Th>
                                            {getValues(mode, row).map(
                                                (value, index) => (
                                                    <Table.Td
                                                        key={columns[index]}
                                                    >
                                                        {value}
                                                    </Table.Td>
                                                ),
                                            )}
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    ))}
            </details>
        </Paper>
    );
};

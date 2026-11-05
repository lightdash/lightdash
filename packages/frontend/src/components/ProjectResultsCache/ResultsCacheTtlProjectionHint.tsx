import { Anchor, Group, Stack, Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useResultsCacheTtlProjections } from '../../hooks/useProjectResultsCacheSettings';
import { formatWarehouseTime } from './formatWarehouseTime';

const MIN_IMPROVEMENT = 0.01;

const formatTtl = (seconds: number): string => {
    const hours = seconds / 3600;
    if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

const formatPercent = (rate: number | null) =>
    rate === null ? 'n/a' : `${Math.round(rate * 100)}%`;

type Props = {
    projectUuid: string;
    onSelect: (ttlSeconds: number) => void;
    disabled: boolean;
};

export const ResultsCacheTtlProjectionHint: FC<Props> = ({
    projectUuid,
    onSelect,
    disabled,
}) => {
    const { data, isError } = useResultsCacheTtlProjections(projectUuid);
    if (
        isError ||
        !data ||
        data.kind !== 'projections' ||
        data.baseline.runs === 0
    )
        return null;

    const baselineRate = data.baseline.hitRate ?? 0;
    const useful = data.projections.filter(
        (p) => (p.hitRate ?? 0) - baselineRate >= MIN_IMPROVEMENT,
    );

    if (useful.length === 0) {
        return (
            <Text c="dimmed" fz="xs">
                A longer cache duration wouldn't noticeably improve the hit
                rate.
            </Text>
        );
    }

    return (
        <Stack gap="xs">
            <Tooltip
                label="Estimated by replaying the last 30 days of queries. Older queries without a recorded reason are assumed to have expired, so early estimates can be optimistic."
                multiline
                w={300}
            >
                <Text c="dimmed" fz="xs">
                    Estimated hit rate with a longer duration
                </Text>
            </Tooltip>
            {useful.map((projection) => (
                <Group key={projection.ttlSeconds} gap="xs">
                    <Anchor
                        component="button"
                        type="button"
                        fz="xs"
                        disabled={disabled}
                        onClick={() => onSelect(projection.ttlSeconds)}
                    >
                        {`At ${formatTtl(projection.ttlSeconds)}`}
                    </Anchor>
                    <Text fz="xs">
                        {`${formatPercent(data.baseline.hitRate)} → ${formatPercent(
                            projection.hitRate,
                        )} (+${projection.additionalHits.toLocaleString()} hits, about ${formatWarehouseTime(
                            Math.round(projection.warehouseTimeSavedMs),
                        )} of warehouse time saved)`}
                    </Text>
                </Group>
            ))}
        </Stack>
    );
};

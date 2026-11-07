import { type ResultsCacheStatsDays } from '@lightdash/common';
import { Anchor, Box, Divider, Group, Stack, Text } from '@mantine/core';
import { Fragment, type FC } from 'react';
import { useResultsCacheTtlProjections } from '../../hooks/useProjectResultsCacheSettings';
import { formatCacheDuration } from './formatCacheDuration';
import { formatCompactNumber } from './formatCompactNumber';
import { formatWarehouseTime } from './formatWarehouseTime';
import classes from './ResultsCacheTtlProjectionHint.module.css';

const MIN_IMPROVEMENT = 0.01;

// Projections are estimates, so always read as approximate.
const withApproximation = (value: string) =>
    value.startsWith('~') ? value : `~${value}`;

type Props = {
    projectUuid: string;
    days: ResultsCacheStatsDays;
    onSelect: (ttlSeconds: number) => void;
    disabled: boolean;
};

export const ResultsCacheTtlProjectionHint: FC<Props> = ({
    projectUuid,
    days,
    onSelect,
    disabled,
}) => {
    const { data, isError } = useResultsCacheTtlProjections(projectUuid, days);
    if (
        isError ||
        !data ||
        data.kind !== 'projections' ||
        data.baseline.runs === 0 ||
        data.projections.length === 0
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
        <Box className={classes.box}>
            <Stack gap="xs">
                <Text fz="sm">Estimated benefit of a longer duration</Text>
                <Stack gap={0}>
                    {useful.map((projection, index) => (
                        <Fragment key={projection.ttlSeconds}>
                            {index > 0 && <Divider />}
                            <Group gap="md" wrap="nowrap" py="xs">
                                <Box className={classes.ttl}>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        fz="sm"
                                        disabled={disabled}
                                        onClick={() =>
                                            onSelect(projection.ttlSeconds)
                                        }
                                    >
                                        {formatCacheDuration(
                                            projection.ttlSeconds,
                                        )}
                                    </Anchor>
                                </Box>
                                <Divider orientation="vertical" />
                                <Text fz="sm" className={classes.hits}>
                                    {`+${formatCompactNumber(projection.additionalHits)} potential hits`}
                                </Text>
                                <Divider orientation="vertical" />
                                <Text fz="sm">
                                    {`${withApproximation(
                                        formatWarehouseTime(
                                            Math.round(
                                                projection.warehouseTimeSavedMs,
                                            ),
                                        ),
                                    )} warehouse time saved`}
                                </Text>
                            </Group>
                        </Fragment>
                    ))}
                </Stack>
                <Text c="dimmed" fz="xs">
                    Based on queries in the selected period.
                </Text>
            </Stack>
        </Box>
    );
};

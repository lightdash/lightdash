import {
    getItemId,
    TimeFrames,
    type ApiError,
    type ApiQueryResults,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { developmentHeadersFor } from './developmentView';
import classes from './MetricPreview.module.css';
import { TryIt } from './TryItButton';
import { useModelVersion } from './useFieldChangesInDevelopment';
import { LIVE_HEADERS, useTotals } from './useMetricTotals';

/** A model a turn touched and the metrics to show from it; null shows every metric of a new model. */
export type MetricPreviewModel = {
    model: string;
    isNew: boolean;
    metrics: { name: string; isNew: boolean }[] | null;
};

const SHOWN = 4;
const DRAFT = developmentHeadersFor(null);

/** Each metric's values by month, oldest first, as the draft reads them. */
const useMonthlyValues = (
    projectUuid: string,
    model: string,
    metricIds: string[],
    monthId: string | null,
    cacheKey: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Record<string, number[]>, ApiError>({
        queryKey: [
            'semantic-layer-draft-trend',
            projectUuid,
            model,
            metricIds,
            monthId,
            cacheKey,
        ],
        queryFn: async () => {
            const { rows } = await lightdashApi<ApiQueryResults>({
                url: `/projects/${projectUuid}/explores/${model}/runQuery`,
                method: 'POST',
                headers: DRAFT,
                body: JSON.stringify({
                    exploreName: model,
                    dimensions: [monthId],
                    metrics: metricIds,
                    filters: {},
                    sorts: [{ fieldId: monthId, descending: false }],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                }),
            });
            return Object.fromEntries(
                metricIds.map((id) => [
                    id,
                    rows.map((row) => Number(row[id]?.value.raw ?? 0)),
                ]),
            );
        },
        enabled: metricIds.length > 0 && monthId !== null,
        keepPreviousData: true,
        retry: false,
        staleTime: 60_000,
    });
};

const Sparkline: FC<{ values: number[] }> = ({ values }) => {
    if (values.length < 2) return <Box w={64} />;
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    const points = values
        .map(
            (value, index) =>
                `${(index / (values.length - 1)) * 64},${15 - ((value - min) / span) * 14}`,
        )
        .join(' ');
    return (
        <svg width={64} height={16} className={classes.sparkline} aria-hidden>
            <polyline points={points} />
        </svg>
    );
};

const ModelPreview: FC<{
    projectUuid: string;
    entry: MetricPreviewModel;
    cacheKey: string;
    onExplore: () => void;
}> = ({ projectUuid, entry, cacheKey, onExplore }) => {
    const { data: explore } = useModelVersion(projectUuid, entry.model, DRAFT);
    const table = explore ? explore.tables[explore.baseTable] : undefined;
    const metrics = table
        ? Object.values(table.metrics).filter(
              (metric) =>
                  !metric.hidden &&
                  (entry.metrics === null ||
                      entry.metrics.some(({ name }) => name === metric.name)),
          )
        : [];
    const ids = metrics.map((metric) => getItemId(metric));
    const liveIds = metrics
        .filter(
            (metric) =>
                !entry.isNew &&
                entry.metrics?.some(
                    ({ name, isNew }) => name === metric.name && !isNew,
                ),
        )
        .map((metric) => getItemId(metric));
    const month = table
        ? Object.values(table.dimensions).find(
              (dimension) =>
                  !dimension.hidden &&
                  dimension.timeInterval === TimeFrames.MONTH,
          )
        : undefined;
    const totals = useTotals(
        projectUuid,
        entry.model,
        ids,
        DRAFT,
        ids.length > 0,
        cacheKey,
    );
    const live = useTotals(
        projectUuid,
        entry.model,
        liveIds,
        LIVE_HEADERS,
        liveIds.length > 0,
        cacheKey,
    );
    const trend = useMonthlyValues(
        projectUuid,
        entry.model,
        ids,
        month ? getItemId(month) : null,
        cacheKey,
    );
    if (metrics.length === 0) return null;
    return (
        <>
            {metrics.slice(0, SHOWN).map((metric) => {
                const id = getItemId(metric);
                const total = totals.data?.[id];
                const before = live.data?.[id];
                const moved =
                    before && total && before.formatted !== total.formatted;
                return (
                    <Group
                        key={id}
                        gap="xs"
                        wrap="nowrap"
                        className={classes.row}
                    >
                        <Text fz="xs" truncate flex={1} miw={0}>
                            {metric.label}
                        </Text>
                        {month ? (
                            <Tooltip
                                label={`${metric.label} by ${month.label.toLowerCase()}`}
                            >
                                <Box>
                                    <Sparkline
                                        values={trend.data?.[id] ?? []}
                                    />
                                </Box>
                            </Tooltip>
                        ) : null}
                        <Stack gap={0} align="flex-end" miw={72}>
                            <Text fz="xs" fw={500}>
                                {totals.isError
                                    ? 'No result'
                                    : (total?.formatted ?? '…')}
                            </Text>
                            {moved ? (
                                <Text fz={10} c="dimmed">
                                    was {before.formatted}
                                </Text>
                            ) : null}
                        </Stack>
                        <Tooltip label="Open in Explore">
                            <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="gray"
                                className={classes.explore}
                                aria-label={`Open ${metric.label} in Explore`}
                                onClick={onExplore}
                            >
                                <MantineIcon icon={IconArrowUpRight} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                );
            })}
            {metrics.length > SHOWN ? (
                <Text fz="xs" c="dimmed">
                    and {metrics.length - SHOWN} more
                </Text>
            ) : null}
        </>
    );
};

/** A turn's metrics as the draft reads them: each total, its trend by month, and what Published said before */
export const MetricPreview: FC<{
    projectUuid: string;
    models: MetricPreviewModel[];
    cacheKey: string;
}> = ({ projectUuid, models, cacheKey }) => {
    const [exploring, setExploring] = useState<string | null>(null);
    if (models.length === 0) return null;
    return (
        <Stack gap={6} className={classes.preview}>
            {models.map((entry) => (
                <ModelPreview
                    key={entry.model}
                    projectUuid={projectUuid}
                    entry={entry}
                    cacheKey={cacheKey}
                    onExplore={() => setExploring(entry.model)}
                />
            ))}
            {exploring ? (
                <TryIt
                    projectUuid={projectUuid}
                    models={[exploring]}
                    previewProjectUuid={null}
                    prUrl={null}
                    onClose={() => setExploring(null)}
                />
            ) : null}
        </Stack>
    );
};

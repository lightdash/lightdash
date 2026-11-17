/** The visual parts of a model's Pre-aggregates tab: queries per day, and a sample of what a pre-aggregate holds. */
import {
    getItemLabelWithoutTableName,
    isField,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import { Box, Group, Table, Text, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { executeExplorePreviewQuery } from '../chartTypes/utils/explorePreviewQuery';
import classes from './PreAggregateInsights.module.css';
import { getPreAggregateQuery, type usageByDay } from './preAggregateSummary';

const SAMPLE_ROWS = 8;

/** Queries per day, stacked: those a pre-aggregate answered, then those that ran on the warehouse. */
export const UsageByDayChart: FC<{ days: ReturnType<typeof usageByDay> }> = ({
    days,
}) => {
    const peak = Math.max(1, ...days.map((day) => day.hits + day.misses));
    return (
        <Box>
            <Group gap="md" mb={6}>
                <Group gap={6}>
                    <Box className={classes.swatch} data-series="hits" />
                    <Text fz="xs" c="dimmed">
                        From a pre-aggregate
                    </Text>
                </Group>
                <Group gap={6}>
                    <Box className={classes.swatch} data-series="misses" />
                    <Text fz="xs" c="dimmed">
                        On the warehouse
                    </Text>
                </Group>
            </Group>
            <Box
                className={classes.days}
                role="img"
                aria-label="Queries per day"
            >
                {days.map((day) => (
                    <Tooltip
                        key={day.date}
                        label={`${dayjs(day.date).format('ddd D MMM')}: ${day.hits.toLocaleString()} from a pre-aggregate, ${day.misses.toLocaleString()} on the warehouse`}
                    >
                        <Box className={classes.day}>
                            <Box className={classes.column}>
                                {day.misses > 0 ? (
                                    <Box
                                        className={classes.bar}
                                        data-series="misses"
                                        h={`${(day.misses / peak) * 100}%`}
                                    />
                                ) : null}
                                {day.hits > 0 ? (
                                    <Box
                                        className={classes.bar}
                                        data-series="hits"
                                        h={`${(day.hits / peak) * 100}%`}
                                    />
                                ) : null}
                            </Box>
                            <Text fz={10} c="dimmed" ta="center">
                                {dayjs(day.date).format('dd')}
                            </Text>
                        </Box>
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
};

/** The first rows of a built pre-aggregate, read from it rather than the warehouse. */
export const PreAggregateSample: FC<{
    projectUuid: string;
    summary: PreAggregateMaterializationSummary;
    baseTable: string;
}> = ({ projectUuid, summary, baseTable }) => {
    const lightdashApi = useLightdashApi();
    const { dimensions, metrics } = getPreAggregateQuery(
        summary,
        baseTable,
    ).metricQuery;
    const { data, isLoading, isError } = useQuery({
        queryKey: [
            'preAggregateSample',
            projectUuid,
            summary.preAggExploreName,
            summary.materialization?.materializedAt,
        ],
        queryFn: () =>
            executeExplorePreviewQuery(lightdashApi, {
                projectUuid,
                query: {
                    exploreName: summary.preAggExploreName,
                    dimensions,
                    metrics,
                    filters: {},
                    sorts: dimensions.map((fieldId, index) => ({
                        fieldId,
                        descending: index === 0,
                    })),
                    limit: SAMPLE_ROWS,
                    tableCalculations: [],
                },
            }),
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });
    if (isError) {
        return (
            <Text fz="xs" c="dimmed">
                A sample could not be read from this pre-aggregate.
            </Text>
        );
    }
    const columns = [...dimensions, ...metrics];
    const label = (fieldId: string) => {
        const item = data?.itemsMap[fieldId];
        return item && isField(item)
            ? getItemLabelWithoutTableName(item)
            : fieldId;
    };
    return (
        <StudioSampleTable
            caption="Sample, read from the pre-aggregate"
            columns={columns.map((id) => ({
                id,
                label: label(id),
                numeric: metrics.includes(id),
            }))}
            rows={(data?.rows ?? []).map((row) =>
                columns.map((id) => row[id]?.value.formatted ?? ''),
            )}
            loading={isLoading}
        />
    );
};

export const StudioSampleTable: FC<{
    caption: string;
    columns: { id: string; label: string; numeric: boolean }[];
    rows: string[][];
    loading: boolean;
}> = ({ caption, columns, rows, loading }) => (
    <Box>
        <Text fz="xs" c="dimmed" mb={4}>
            {caption}
        </Text>
        <Box className={classes.sample}>
            <Table
                aria-label={caption}
                fz="xs"
                verticalSpacing={4}
                horizontalSpacing="xs"
            >
                <Table.Thead>
                    <Table.Tr>
                        {columns.map(({ id, label, numeric }) => (
                            <Table.Th key={id} data-numeric={numeric}>
                                {label}
                            </Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {loading
                        ? Array.from({ length: 3 }, (_, index) => (
                              <Table.Tr key={index}>
                                  <Table.Td colSpan={columns.length}>
                                      <Box className={classes.loadingRow} />
                                  </Table.Td>
                              </Table.Tr>
                          ))
                        : rows.map((row, index) => (
                              <Table.Tr key={index}>
                                  {columns.map(({ id, numeric }, column) => (
                                      <Table.Td key={id} data-numeric={numeric}>
                                          {row[column]}
                                      </Table.Td>
                                  ))}
                              </Table.Tr>
                          ))}
                </Table.Tbody>
            </Table>
        </Box>
    </Box>
);

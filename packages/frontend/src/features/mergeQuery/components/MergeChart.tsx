import { type MergeQueryField } from '@lightdash/common';
import { Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { type EChartsOption } from 'echarts';
import { useMemo, type FC } from 'react';
import EChartsReact from '../../../components/EChartsReactWrapper';

export type MergeChartType = 'bar' | 'line';

type Props = {
    fields: MergeQueryField[];
    rows: Record<string, unknown>[];
    chartType: MergeChartType;
    onChartTypeChange: (chartType: MergeChartType) => void;
};

const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T[\d:.]+Z?$/;

/**
 * Date columns arrive as full ISO timestamps because that is what the
 * warehouse returns. A month axis reading 2024-03-01T00:00:00.000Z is
 * noise, so the time is dropped for date and timestamp keys.
 */
const formatCategory = (value: unknown, isTemporal: boolean): string => {
    if (value === null || value === undefined) return '∅';
    const text = String(value);
    if (!isTemporal) return text;
    const match = ISO_TIMESTAMP.exec(text);
    return match ? match[1] : text;
};

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Charts a merged result.
 *
 * The axis choice comes from the merged fields rather than from the column
 * names: a widened metric becomes one column per value, so the names alone
 * cannot say which columns are measures and which is the key. Every metric
 * column becomes a series, which is the shape a merge naturally produces —
 * one key, several measures from either query.
 */
export const MergeChart: FC<Props> = ({
    fields,
    rows,
    chartType,
    onChartTypeChange,
}) => {
    const dimensionField = fields.find((field) => field.kind === 'dimension');
    const metricFields = useMemo(
        () => fields.filter((field) => field.kind === 'metric'),
        [fields],
    );

    const option = useMemo<EChartsOption | null>(() => {
        if (!dimensionField || metricFields.length === 0) return null;

        const isTemporal =
            dimensionField.type === 'date' ||
            dimensionField.type === 'timestamp';
        const categories = rows.map((row) =>
            formatCategory(row[dimensionField.column], isTemporal),
        );

        return {
            grid: { left: 56, right: 24, top: 32, bottom: 56 },
            tooltip: { trigger: 'axis' },
            legend: { type: 'scroll', bottom: 0 },
            xAxis: {
                type: 'category',
                data: categories,
                axisLabel: { hideOverlap: true },
            },
            yAxis: { type: 'value' },
            series: metricFields.map((field) => ({
                name: field.label,
                type: chartType,
                // Gaps are real: a full join keeps keys one query never had,
                // and joining them up would invent data.
                connectNulls: false,
                emphasis: { focus: 'series' as const },
                data: rows.map((row) => toNumber(row[field.column])),
            })),
        };
    }, [dimensionField, metricFields, rows, chartType]);

    if (!option) {
        return (
            <Text size="sm" c="dimmed">
                A chart needs the join key and at least one metric. Add a metric
                to either query.
            </Text>
        );
    }

    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text size="xs" c="dimmed">
                    Chart
                </Text>
                <SegmentedControl
                    size="xs"
                    value={chartType}
                    onChange={(value) =>
                        onChartTypeChange(value as MergeChartType)
                    }
                    data={[
                        { label: 'Bars', value: 'bar' },
                        { label: 'Lines', value: 'line' },
                    ]}
                />
                <Text size="xs" c="dimmed">
                    {metricFields.length} series over {dimensionField?.label}
                </Text>
            </Group>
            <EChartsReact
                option={option}
                style={{ height: 320, width: '100%' }}
                notMerge
            />
        </Stack>
    );
};

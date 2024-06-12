import {
    formatItemValue,
    isField,
    isMetric,
    isTableCalculation,
    type ApiQueryResults,
    type CustomDimension,
    type Dimension,
    type FunnelChart,
    type ItemsMap,
    type Metric,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';

type FunnelChartConfig = {
    validConfig: FunnelChart;

    metricId: string | null;
    selectedMetric: Metric | TableCalculation | undefined;
    // metricChange: (metricId: string | null) => void;

    data: {
        name: string;
        value: number;
        meta: {
            value: ResultValue;
            rows: ResultRow[];
        };
    }[];
};

export type FunnelChartConfigFn = (
    resultsData: ApiQueryResults | undefined,
    funnelChartConfig: FunnelChart | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, CustomDimension | Dimension>,
    numericMetrics: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => FunnelChartConfig;

const useFunnelChartConfig: FunnelChartConfigFn = (
    resultsData,
    funnelChartConfig,
    itemsMap,
    dimensions,
    numericMetrics,
    colorPalette,
    tableCalculationsMetadata,
) => {
    const [metricId, setMetricId] = useState(
        funnelChartConfig?.metricId ?? null,
    );

    // const dimensionIds = useMemo(() => Object.keys(dimensions), [dimensions]);

    const allNumericMetricIds = useMemo(
        () => Object.keys(numericMetrics),
        [numericMetrics],
    );

    const selectedMetric = useMemo(() => {
        if (!itemsMap || !metricId) return undefined;
        const item = itemsMap[metricId];

        if ((isField(item) && isMetric(item)) || isTableCalculation(item))
            return item;

        return undefined;
    }, [itemsMap, metricId]);

    const isLoading = !resultsData;

    useEffect(() => {
        if (isLoading || allNumericMetricIds.length === 0) return;
        if (metricId && allNumericMetricIds.includes(metricId)) return;

        /**
         * When table calculations update, their name changes, so we need to update the selected fields
         * If the selected field is a table calculation with the old name in the metadata, set it to the new name
         */
        if (tableCalculationsMetadata) {
            const metricTcIndex = tableCalculationsMetadata.findIndex(
                (tc) => tc.oldName === metricId,
            );

            if (metricTcIndex !== -1) {
                setMetricId(tableCalculationsMetadata[metricTcIndex].name);
                return;
            }
        }

        setMetricId(allNumericMetricIds[0] ?? null);
    }, [allNumericMetricIds, isLoading, metricId, tableCalculationsMetadata]);

    const data = useMemo(() => {
        if (
            !metricId ||
            !selectedMetric ||
            !resultsData ||
            resultsData.rows.length === 0
        ) {
            return [];
        }

        const isMetricPresentInResults = resultsData?.rows.some(
            (r) => r[metricId],
        );

        if (!isMetricPresentInResults) {
            return [];
        }

        const mappedData = resultsData.rows.map((row) => {
            const value = Number(row[metricId].value.raw);

            return { name: row[metricId].value.formatted, value, row };
        });

        return Object.entries(
            mappedData.reduce<
                Record<
                    string,
                    {
                        value: number;
                        rows: ResultRow[];
                    }
                >
            >((acc, { name, value, row }) => {
                return {
                    ...acc,
                    [name]: {
                        value: (acc[name]?.value ?? 0) + value,
                        rows: [...(acc[name]?.rows ?? []), row],
                    },
                };
            }, {}),
        )
            .map(([name, { value, rows }]) => ({
                name,
                value,
                meta: {
                    value: {
                        formatted: formatItemValue(selectedMetric, value),
                        raw: value,
                    },
                    rows,
                },
            }))
            .sort((a, b) => b.value - a.value);
    }, [resultsData, selectedMetric, metricId]);

    const validConfig: FunnelChart = useMemo(
        () => ({
            metricId: metricId ?? undefined,
        }),
        [metricId],
    );

    return {
        validConfig,

        selectedMetric,
        metricId,
        metricChange: setMetricId,

        data,
    };
};

export default useFunnelChartConfig;

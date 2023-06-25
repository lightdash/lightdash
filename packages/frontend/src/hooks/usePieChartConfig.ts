import {
    Dimension,
    fieldId,
    Metric,
    PieChart,
    TableCalculation,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

type PieChartConfig = {
    validPieChartConfig: PieChart;
    isDonut: boolean;
    toggleDonut: () => void;
    groupAdd: () => void;
    groupChange: (prevValue: any, newValue: any) => void;
    groupRemove: (dimensionId: any) => void;
    groupFieldIds: (string | null)[];
    metricId: string | null;
    metricChange: (metricId: string | null) => void;
};

type PieChartConfigFn = (
    pieChartConfig: PieChart | undefined,
    fields: {
        dimensions: Dimension[];
        metrics: Metric[];
        customMetrics: Metric[];
        tableCalculations: TableCalculation[];
    },
) => PieChartConfig;

const usePieChartConfig: PieChartConfigFn = (
    pieChartConfig,
    { customMetrics, dimensions, metrics, tableCalculations },
) =>
    // resultsData: ApiQueryResults | undefined,
    // explore: Explore | undefined,
    {
        const [isDonut, setIsDonut] = useState<boolean>(
            pieChartConfig?.isDonut ?? false,
        );
        const [groupFieldIds, setGroupFieldIds] = useState<Set<string | null>>(
            new Set(pieChartConfig?.groupFieldIds ?? [fieldId(dimensions[0])]),
        );
        const [metricId, setMetricId] = useState<string | null>(
            pieChartConfig?.metricId ??
                fieldId([...metrics, ...customMetrics][0]) ??
                tableCalculations[0].name,
        );

        const handleGroupChange = useCallback((prevValue, newValue) => {
            setGroupFieldIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(prevValue);
                newSet.add(newValue);
                return newSet;
            });
        }, []);

        const handleGroupAdd = useCallback(() => {
            setGroupFieldIds((prev) => {
                const nextDimension = dimensions.find(
                    (d) => !prev.has(fieldId(d)),
                );

                const newSet = new Set(prev);
                newSet.add(nextDimension ? fieldId(nextDimension) : null);
                return newSet;
            });
        }, [dimensions]);

        const handleRemoveGroup = useCallback((dimensionId) => {
            setGroupFieldIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(dimensionId);
                return newSet;
            });
        }, []);

        const validPieChartConfig: PieChart = useMemo(
            () => ({
                isDonut,
                groupFieldIds: Array.from(groupFieldIds).filter(
                    (id): id is string => id !== null,
                ),
                metricId: metricId ?? undefined,
            }),
            [isDonut, groupFieldIds, metricId],
        );

        const values: PieChartConfig = useMemo(
            () => ({
                validPieChartConfig,

                isDonut,
                toggleDonut: () => setIsDonut((prev) => !prev),

                groupAdd: handleGroupAdd,
                groupChange: handleGroupChange,
                groupRemove: handleRemoveGroup,
                groupFieldIds: Array.from(groupFieldIds),

                metricId,
                metricChange: setMetricId,
            }),
            [
                validPieChartConfig,

                isDonut,

                handleGroupAdd,
                handleGroupChange,
                handleRemoveGroup,

                groupFieldIds,

                metricId,
            ],
        );

        return values;
    };

export default usePieChartConfig;

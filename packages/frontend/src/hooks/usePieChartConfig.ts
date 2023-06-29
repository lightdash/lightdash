import { Explore, PieChart } from '@lightdash/common';
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
    explore: Explore | undefined,
    dimensionIds: string[],
    allMetricIds: string[],
    // resultsData: ApiQueryResults | undefined,
) => PieChartConfig;

const usePieChartConfig: PieChartConfigFn = (
    pieChartConfig,
    _explore,
    dimensionIds,
    allMetricIds,
) => {
    const [isDonut, setIsDonut] = useState<boolean>(
        pieChartConfig?.isDonut ?? false,
    );

    const [groupFieldIds, setGroupFieldIds] = useState<Set<string | null>>(
        new Set(
            pieChartConfig?.groupFieldIds?.filter((id) =>
                dimensionIds.includes(id),
            ) ??
                dimensionIds[0] ??
                null,
        ),
    );

    const [metricId, setMetricId] = useState<string | null>(
        pieChartConfig?.metricId &&
            allMetricIds.includes(pieChartConfig.metricId)
            ? pieChartConfig.metricId
            : allMetricIds[0] ?? null,
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
            const nextId = dimensionIds.find((id) => !prev.has(id));

            const newSet = new Set(prev);
            newSet.add(nextId ?? null);
            return newSet;
        });
    }, [dimensionIds]);

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

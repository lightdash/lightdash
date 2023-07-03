import { ApiQueryResults, Explore, PieChart } from '@lightdash/common';
import { isEqual } from 'lodash-es';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
    explore: Explore | undefined,
    resultsData: ApiQueryResults | undefined,
    pieChartConfig: PieChart | undefined,
    dimensionIds: string[],
    allMetricIds: string[],
) => PieChartConfig;

const usePieChartConfig: PieChartConfigFn = (
    explore,
    resultsData,
    pieChartConfig,
    dimensionIds,
    allNumericMetricIds,
) => {
    const [isDonut, setIsDonut] = useState<boolean>(
        pieChartConfig?.isDonut ?? false,
    );

    const [groupFieldIds, setGroupFieldIds] = useState<(string | null)[]>(
        pieChartConfig?.groupFieldIds ?? [],
    );

    const [metricId, setMetricId] = useState<string | null>(
        pieChartConfig?.metricId ?? null,
    );

    const isLoading = !explore || !resultsData;

    useEffect(() => {
        if (isLoading) return;

        const newGroupFieldIds = groupFieldIds.filter(
            (id) => id === null || dimensionIds.includes(id),
        );

        const firstDimensionId = dimensionIds[0];
        if (newGroupFieldIds.length === 0 && firstDimensionId) {
            setGroupFieldIds([firstDimensionId]);
            return;
        }

        if (isEqual(newGroupFieldIds, groupFieldIds)) return;

        setGroupFieldIds(newGroupFieldIds);
    }, [isLoading, dimensionIds, groupFieldIds, pieChartConfig?.groupFieldIds]);

    useEffect(() => {
        if (isLoading) return;
        if (metricId && allNumericMetricIds.includes(metricId)) return;

        setMetricId(allNumericMetricIds[0] ?? null);
    }, [isLoading, allNumericMetricIds, metricId, pieChartConfig?.metricId]);

    const handleGroupChange = useCallback((prevValue, newValue) => {
        setGroupFieldIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(prevValue);
            newSet.add(newValue);
            return [...newSet.values()];
        });
    }, []);

    const handleGroupAdd = useCallback(() => {
        setGroupFieldIds((prev) => {
            const nextId = dimensionIds.find((id) => !prev.includes(id));

            const newSet = new Set(prev);
            newSet.add(nextId ?? null);
            return [...newSet.values()];
        });
    }, [dimensionIds]);

    const handleRemoveGroup = useCallback((dimensionId) => {
        setGroupFieldIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(dimensionId);
            return [...newSet.values()];
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

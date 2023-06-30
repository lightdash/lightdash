import { ApiQueryResults, Explore, PieChart } from '@lightdash/common';
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
    allMetricIds,
) => {
    const [isDonut, setIsDonut] = useState<boolean>(
        pieChartConfig?.isDonut ?? false,
    );

    const [groupFieldIds, setGroupFieldIds] = useState<Set<string | null>>(
        new Set(pieChartConfig?.groupFieldIds),
    );

    const [metricId, setMetricId] = useState<string | null>(
        pieChartConfig?.metricId ?? null,
    );

    const isLoading = !explore || !resultsData;

    useEffect(() => {
        if (isLoading) return;

        const newSet = new Set<string | null>();

        [...groupFieldIds.values()].forEach((id) => {
            if (id === null || dimensionIds.includes(id)) {
                newSet.add(id);
            }
        });

        if (newSet.size === 0) {
            const firstId = dimensionIds[0];
            newSet.add(firstId ?? null);
            setGroupFieldIds(newSet);
            return;
        }

        let areSetsEqual = (a: Set<unknown>, b: Set<unknown>) =>
            a.size === b.size && [...a].every((value) => b.has(value));

        if (areSetsEqual(newSet, groupFieldIds)) return;

        setGroupFieldIds(newSet);
    }, [isLoading, dimensionIds, groupFieldIds, pieChartConfig?.groupFieldIds]);

    useEffect(() => {
        if (isLoading) return;

        if (metricId === null || allMetricIds.includes(metricId)) return;

        setMetricId(allMetricIds[0] ?? null);
    }, [isLoading, allMetricIds, metricId, pieChartConfig?.metricId]);

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

import { Explore, PieChart } from '@lightdash/common';
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
        new Set(),
    );

    useEffect(() => {
        const prevGroupFieldIds = [...groupFieldIds.values()].filter(
            (id): id is string => (id ? dimensionIds.includes(id) : false),
        );

        if (prevGroupFieldIds.length !== 0 || dimensionIds.length === 0) return;

        const persistedGroupFieldIds = pieChartConfig?.groupFieldIds?.filter(
            (id) => dimensionIds.includes(id),
        );

        const newGroupFieldIds =
            persistedGroupFieldIds && persistedGroupFieldIds.length > 0
                ? new Set(persistedGroupFieldIds)
                : new Set([dimensionIds[0] ?? null]);

        setGroupFieldIds(newGroupFieldIds);
    }, [dimensionIds, groupFieldIds, pieChartConfig?.groupFieldIds]);

    const [metricId, setMetricId] = useState<string | null>(null);

    useEffect(() => {
        const prevMetricId =
            metricId && allMetricIds.includes(metricId) ? metricId : null;

        if (prevMetricId !== null || allMetricIds.length === 0) return;

        const persistedMetricId =
            pieChartConfig?.metricId &&
            allMetricIds.includes(pieChartConfig.metricId)
                ? pieChartConfig.metricId
                : null;

        const firstMetricid = allMetricIds[0];

        setMetricId(persistedMetricId ?? firstMetricid ?? null);
    }, [allMetricIds, metricId, pieChartConfig?.metricId]);

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

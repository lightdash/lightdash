import { PieChart } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

const usePieChartConfig = (
    pieChartConfig: PieChart | undefined,
    // resultsData: ApiQueryResults | undefined,
    // explore: Explore | undefined,
) => {
    const [isDonut, setIsDonut] = useState<boolean>(
        pieChartConfig?.isDonut ?? false,
    );
    const [groupFieldIds, setGroupFieldIds] = useState<Set<string | null>>(
        new Set(pieChartConfig?.groupFieldIds ?? [null]),
    );
    const [metricId, setMetricId] = useState<string | null>(
        pieChartConfig?.metricId ?? null,
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
            const newSet = new Set(prev);
            newSet.add(null);
            return newSet;
        });
    }, []);

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

    const values = useMemo(
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

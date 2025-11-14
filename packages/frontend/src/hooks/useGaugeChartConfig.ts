import {
    ChartType,
    getItemId,
    isMetric,
    isNumericItem,
    isTableCalculation,
    type GaugeChart,
    type ItemsMap,
} from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

const getItemPriority = (item: ItemsMap[string]): number => {
    if (isMetric(item)) {
        return 1;
    }
    if (isTableCalculation(item)) {
        return 2;
    }
    return 3;
};

const useGaugeChartConfig = (
    initialChartConfig: GaugeChart | undefined,
    itemsMap: ItemsMap | undefined,
) => {
    const availableFieldsIds = useMemo(() => {
        const numericItems = Object.values(itemsMap || {}).filter(
            isNumericItem,
        );
        const itemsSortedByType = numericItems.sort((a, b) => {
            return getItemPriority(a) - getItemPriority(b);
        });
        return itemsSortedByType.map(getItemId);
    }, [itemsMap]);

    const [selectedField, setSelectedFieldState] = useState<string | undefined>(
        initialChartConfig?.selectedField,
    );
    const [min, setMin] = useState<number>(initialChartConfig?.min ?? 0);
    const [max, setMax] = useState<number>(initialChartConfig?.max ?? 100);
    const [showProgress, setShowProgress] = useState<boolean>(
        initialChartConfig?.showProgress ?? false,
    );
    const [isRadial, setIsRadial] = useState<boolean>(
        initialChartConfig?.isRadial ?? false,
    );

    // Get the effective selected field - use state value or fallback to first available
    const effectiveSelectedField = useMemo(() => {
        if (selectedField) return selectedField;
        return availableFieldsIds.length > 0
            ? availableFieldsIds[0]
            : undefined;
    }, [selectedField, availableFieldsIds]);

    const setSelectedField = useCallback((field: string | undefined) => {
        setSelectedFieldState(field);
    }, []);

    const getField = useCallback(
        (fieldNameOrId: string | undefined) => {
            if (!fieldNameOrId || !itemsMap) return;
            return itemsMap[fieldNameOrId];
        },
        [itemsMap],
    );

    const validConfig: GaugeChart = useMemo(() => {
        return {
            selectedField: effectiveSelectedField,
            min,
            max,
            showProgress,
            isRadial,
        };
    }, [effectiveSelectedField, min, max, showProgress, isRadial]);

    return useMemo(
        () => ({
            chartType: ChartType.GAUGE as const,
            chartConfig: {
                validConfig,
            },
            selectedField: effectiveSelectedField,
            setSelectedField,
            getField,
            min,
            setMin,
            max,
            setMax,
            showProgress,
            setShowProgress,
            isRadial,
            setIsRadial,
        }),
        [
            validConfig,
            effectiveSelectedField,
            setSelectedField,
            getField,
            min,
            max,
            showProgress,
            isRadial,
        ],
    );
};

export default useGaugeChartConfig;

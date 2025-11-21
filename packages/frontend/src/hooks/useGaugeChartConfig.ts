import {
    ChartType,
    getItemId,
    isMetric,
    isNumericItem,
    isTableCalculation,
    type GaugeChart,
    type GaugeSection,
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
    const [maxFieldId, setMaxFieldId] = useState<string | undefined>(
        initialChartConfig?.maxFieldId,
    );
    const [showAxisLabels, setShowAxisLabels] = useState<boolean>(
        initialChartConfig?.showAxisLabels ?? false,
    );
    const [sections, setSections] = useState<GaugeSection[]>(
        initialChartConfig?.sections ?? [],
    );
    const [customLabel, setCustomLabel] = useState<string | undefined>(
        initialChartConfig?.customLabel,
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
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
        };
    }, [
        effectiveSelectedField,
        min,
        max,
        maxFieldId,
        showAxisLabels,
        sections,
        customLabel,
    ]);

    return useMemo(
        () => ({
            chartType: ChartType.GAUGE as const,
            validConfig,
            selectedField: effectiveSelectedField,
            setSelectedField,
            getField,
            min,
            setMin,
            max,
            setMax,
            maxFieldId,
            setMaxFieldId,
            showAxisLabels,
            setShowAxisLabels,
            sections,
            setSections,
            customLabel,
            setCustomLabel,
        }),
        [
            validConfig,
            effectiveSelectedField,
            setSelectedField,
            getField,
            min,
            max,
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
        ],
    );
};

export default useGaugeChartConfig;

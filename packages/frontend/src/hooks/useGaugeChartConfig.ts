import {
    ChartType,
    type GaugeChart,
    type GaugeSection,
    type ItemsMap,
} from '@lightdash/common';
import {
    getAvailableGaugeFieldIds,
    getEffectiveGaugeSelectedField,
} from '@lightdash/visualization';
import { useCallback, useMemo, useState } from 'react';

/**
 * The explorer's editable gauge config. The derivations (available fields,
 * the effective selected field) come from `@lightdash/visualization`; this
 * hook only holds the editor state and its mutators.
 */
const useGaugeChartConfig = (
    initialChartConfig: GaugeChart | undefined,
    itemsMap: ItemsMap | undefined,
) => {
    const availableFieldsIds = useMemo(
        () => getAvailableGaugeFieldIds(itemsMap),
        [itemsMap],
    );

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
    const [showPercentage, setShowPercentage] = useState<boolean>(
        initialChartConfig?.showPercentage ?? false,
    );
    const [customPercentageLabel, setCustomPercentageLabel] = useState<
        string | undefined
    >(initialChartConfig?.customPercentageLabel);

    // Get the effective selected field - use state value or fallback to first available
    const effectiveSelectedField = useMemo(
        () => getEffectiveGaugeSelectedField(selectedField, availableFieldsIds),
        [selectedField, availableFieldsIds],
    );

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
            showPercentage,
            customPercentageLabel,
        };
    }, [
        effectiveSelectedField,
        min,
        max,
        maxFieldId,
        showAxisLabels,
        sections,
        customLabel,
        showPercentage,
        customPercentageLabel,
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
            showPercentage,
            setShowPercentage,
            customPercentageLabel,
            setCustomPercentageLabel,
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
            showPercentage,
            customPercentageLabel,
        ],
    );
};

export default useGaugeChartConfig;

import {
    getItemId,
    isMetric,
    isNumericItem,
    isTableCalculation,
    type GaugeChart,
    type ItemsMap,
} from '@lightdash/common';

/** Metrics first, then table calculations, then everything else. */
export const getGaugeItemPriority = (item: ItemsMap[string]): number => {
    if (isMetric(item)) {
        return 1;
    }
    if (isTableCalculation(item)) {
        return 2;
    }
    return 3;
};

/** The numeric items a gauge can plot, metrics first. */
export const getAvailableGaugeFieldIds = (
    itemsMap: ItemsMap | undefined,
): string[] => {
    const numericItems = Object.values(itemsMap || {}).filter(isNumericItem);
    const itemsSortedByType = numericItems.sort((a, b) => {
        return getGaugeItemPriority(a) - getGaugeItemPriority(b);
    });
    return itemsSortedByType.map(getItemId);
};

// Get the effective selected field - use state value or fallback to first available
export const getEffectiveGaugeSelectedField = (
    selectedField: string | undefined,
    availableFieldsIds: string[],
): string | undefined => {
    if (selectedField) return selectedField;
    return availableFieldsIds.length > 0 ? availableFieldsIds[0] : undefined;
};

export type ResolveGaugeChartConfigArgs = {
    chartConfig: GaugeChart | undefined;
    itemsMap: ItemsMap | undefined;
};

/**
 * Resolves a saved gauge config against the query's items, the way the
 * explorer does when it first mounts a chart: fills in the defaults and
 * picks the first numeric field when none is selected.
 *
 * The frontend's `useGaugeChartConfig` holds the same values as editor
 * state; this is the one-shot equivalent for headless rendering.
 */
export const resolveGaugeChartConfig = ({
    chartConfig: initialChartConfig,
    itemsMap,
}: ResolveGaugeChartConfigArgs): GaugeChart => {
    const availableFieldsIds = getAvailableGaugeFieldIds(itemsMap);

    return {
        selectedField: getEffectiveGaugeSelectedField(
            initialChartConfig?.selectedField,
            availableFieldsIds,
        ),
        min: initialChartConfig?.min ?? 0,
        max: initialChartConfig?.max ?? 100,
        maxFieldId: initialChartConfig?.maxFieldId,
        showAxisLabels: initialChartConfig?.showAxisLabels ?? false,
        sections: initialChartConfig?.sections ?? [],
        customLabel: initialChartConfig?.customLabel,
        showPercentage: initialChartConfig?.showPercentage ?? false,
        customPercentageLabel: initialChartConfig?.customPercentageLabel,
    };
};

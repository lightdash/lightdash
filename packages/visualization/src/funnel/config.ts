import {
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getItemLabelWithoutTableName,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    type FunnelChart,
    type ItemsMap,
    type Metric,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { type FunnelSeriesOption } from 'echarts';
import { type VisualizationResults } from '../types';

export type FunnelSeriesDataPoint = NonNullable<
    FunnelSeriesOption['data']
>[number] & {
    id: string;
    name: string;
    value: number;
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

export const DEFAULT_FUNNEL_DATA_INPUT = FunnelChartDataInput.ROW;

export const DEFAULT_FUNNEL_LABELS: FunnelChart['labels'] = {
    position: FunnelChartLabelPosition.INSIDE,
    showValue: true,
    showPercentage: false,
};

export const DEFAULT_FUNNEL_SHOW_LEGEND = true;

export const DEFAULT_FUNNEL_LEGEND_POSITION =
    FunnelChartLegendPosition.HORIZONTAL;

/**
 * The fields a funnel can plot: numeric metrics and numeric table
 * calculations. The frontend's `VisualizationConfigFunnel` computes the same
 * map for the editor.
 */
export const getFunnelNumericFields = (
    itemsMap: ItemsMap | undefined,
): Record<string, Metric | TableCalculation> => {
    const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
    const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);

    const numericTableCalculations = Object.keys(tableCalculations).reduce<
        Record<string, TableCalculation>
    >((acc, key) => {
        const tableCalculation = tableCalculations[key];
        if (isNumericItem(tableCalculation)) {
            acc[key] = tableCalculation;
        }
        return acc;
    }, {});

    return { ...metrics, ...numericTableCalculations };
};

/** The metric or table calculation `fieldId` points at, if it is one. */
export const getFunnelSelectedField = (
    itemsMap: ItemsMap | undefined,
    fieldId: string | null,
): Metric | TableCalculation | undefined => {
    if (!itemsMap || !fieldId || !(fieldId in itemsMap)) return undefined;
    const item = itemsMap[fieldId];

    if ((isField(item) && isMetric(item)) || isTableCalculation(item))
        return item;

    return undefined;
};

/**
 * The field id the funnel should plot: the current one when it is still a
 * numeric field, its new name when a table calculation was renamed, else the
 * first numeric field. With no numeric fields the current id is kept.
 */
export const resolveFunnelFieldId = ({
    fieldId,
    allNumericFieldIds,
    tableCalculationsMetadata,
}: {
    fieldId: string | null;
    allNumericFieldIds: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
}): string | null => {
    if (allNumericFieldIds.length === 0) return fieldId;
    if (fieldId && allNumericFieldIds.includes(fieldId)) return fieldId;

    /**
     * When table calculations update, their name changes, so we need to update the selected fields
     * If the selected field is a table calculation with the old name in the metadata, set it to the new name
     */
    if (tableCalculationsMetadata) {
        const metricTcIndex = tableCalculationsMetadata.findIndex(
            (tc) => tc.oldName === fieldId,
        );

        if (metricTcIndex !== -1) {
            return tableCalculationsMetadata[metricTcIndex].name;
        }
    }

    return allNumericFieldIds[0] ?? null;
};

export type FunnelChartData = {
    data: FunnelSeriesDataPoint[];
    /**
     * Max value is the largest step value, used to calculate the percentage
     * each step represents
     */
    maxValue: number;
};

/**
 * The funnel steps: one per row of the selected field (column input), or one
 * per numeric field of the first row (row input).
 */
export const getFunnelChartData = ({
    resultsData,
    fieldId,
    selectedField,
    dataInput,
    allNumericFieldIds,
    itemsMap,
}: {
    resultsData: Pick<VisualizationResults, 'rows'> | undefined;
    fieldId: string | null;
    selectedField: Metric | TableCalculation | undefined;
    dataInput: FunnelChartDataInput;
    allNumericFieldIds: string[];
    itemsMap: ItemsMap | undefined;
}): FunnelChartData => {
    if (
        !resultsData ||
        !fieldId ||
        !selectedField ||
        resultsData.rows.length === 0
    ) {
        return { data: [], maxValue: 0 };
    }

    let dataMaxValue = 0;

    if (dataInput === FunnelChartDataInput.COLUMN) {
        const fieldIndex = Object.keys(resultsData.rows[0]).findIndex(
            (field) => {
                return field === fieldId;
            },
        );

        if (fieldIndex === -1) {
            return { data: [], maxValue: 0 };
        }

        return {
            data: resultsData.rows.map<FunnelSeriesDataPoint>((row) => {
                const rowValues = Object.values(row).map((col) => col.value);

                const dataValue = Number(rowValues[fieldIndex].raw);
                if (dataValue > dataMaxValue) {
                    dataMaxValue = dataValue;
                }
                const rowId = rowValues[0].formatted;
                return {
                    id: rowId,
                    name: rowValues[0].formatted,
                    value: dataValue,
                    meta: {
                        value: rowValues[fieldIndex],
                        rows: [row],
                    },
                };
            }),
            maxValue: dataMaxValue,
        };
    }
    return {
        data: allNumericFieldIds.reduce<FunnelSeriesDataPoint[]>((acc, id) => {
            if (resultsData.rows[0][id]) {
                const dataValue = Number(resultsData.rows[0][id].value.raw);
                if (dataValue > dataMaxValue) {
                    dataMaxValue = dataValue;
                }
                const item = itemsMap?.[id];
                const fieldName = item
                    ? getItemLabelWithoutTableName(item)
                    : id;
                acc.push({
                    id,
                    name: fieldName,
                    value: dataValue,
                    meta: {
                        value: resultsData.rows[0][id].value,
                        rows: resultsData.rows,
                    },
                });
            }
            return acc;
        }, []),
        maxValue: dataMaxValue,
    };
};

/** The palette color of each step, by its position. */
export const getFunnelColorDefaults = (
    data: FunnelSeriesDataPoint[],
    colorPalette: string[],
): Record<string, string> => {
    return Object.fromEntries(
        data.map((item, index) => {
            return [item.id, colorPalette[index % colorPalette.length]];
        }),
    );
};

export const buildValidFunnelConfig = ({
    dataInput,
    fieldId,
    labels,
    labelOverrides,
    colorOverrides,
    showLegend,
    legendPosition,
}: {
    dataInput: FunnelChartDataInput;
    fieldId: string | null;
    labels: FunnelChart['labels'];
    labelOverrides: Record<string, string>;
    colorOverrides: Record<string, string>;
    showLegend: boolean;
    legendPosition: FunnelChartLegendPosition;
}): FunnelChart => ({
    dataInput,
    fieldId: fieldId ?? undefined,
    labels,
    labelOverrides,
    colorOverrides,
    showLegend,
    legendPosition,
});

export type ResolveFunnelChartConfigArgs = {
    chartConfig: FunnelChart | undefined;
    resultsData: Pick<VisualizationResults, 'rows'> | undefined;
    itemsMap: ItemsMap | undefined;
    colorPalette: string[];
    /** Defaults to the numeric metrics and table calculations of `itemsMap`. */
    numericFields?: Record<string, Metric | TableCalculation>;
    tableCalculationsMetadata?: TableCalculationMetadata[];
};

export type ResolvedFunnelChartConfig = FunnelChartData & {
    validConfig: FunnelChart;
    fieldId: string | null;
    selectedField: Metric | TableCalculation | undefined;
    colorDefaults: Record<string, string>;
};

/**
 * Resolves a saved funnel chart config against query results, the way the
 * explorer does when it first mounts a chart: fills in defaults, picks a
 * numeric field when the saved one is gone, and derives the steps, the max
 * value and the default colors the ECharts option is built from.
 *
 * The frontend's `useFunnelChartConfig` runs the same steps inside its
 * effects and memos; this is the one-shot equivalent for headless rendering.
 */
export const resolveFunnelChartConfig = ({
    chartConfig,
    resultsData,
    itemsMap,
    colorPalette,
    numericFields = getFunnelNumericFields(itemsMap),
    tableCalculationsMetadata,
}: ResolveFunnelChartConfigArgs): ResolvedFunnelChartConfig => {
    const allNumericFieldIds = Object.keys(numericFields);

    // Twice: a renamed table calculation is first followed to its new name,
    // then dropped if that name is not in the pool, which is what the editor
    // settles on over two renders.
    const repair = (id: string | null) =>
        resolveFunnelFieldId({
            fieldId: id,
            allNumericFieldIds,
            tableCalculationsMetadata,
        });
    const fieldId = resultsData
        ? repair(repair(chartConfig?.fieldId ?? null))
        : (chartConfig?.fieldId ?? null);

    const dataInput = chartConfig?.dataInput ?? DEFAULT_FUNNEL_DATA_INPUT;
    const selectedField = getFunnelSelectedField(itemsMap, fieldId);

    const { data, maxValue } = getFunnelChartData({
        resultsData,
        fieldId,
        selectedField,
        dataInput,
        allNumericFieldIds,
        itemsMap,
    });

    return {
        validConfig: buildValidFunnelConfig({
            dataInput,
            fieldId,
            labels: chartConfig?.labels ?? DEFAULT_FUNNEL_LABELS,
            labelOverrides: chartConfig?.labelOverrides ?? {},
            colorOverrides: chartConfig?.colorOverrides ?? {},
            showLegend: chartConfig?.showLegend ?? DEFAULT_FUNNEL_SHOW_LEGEND,
            legendPosition:
                chartConfig?.legendPosition ?? DEFAULT_FUNNEL_LEGEND_POSITION,
        }),
        fieldId,
        selectedField,
        data,
        maxValue,
        colorDefaults: getFunnelColorDefaults(data, colorPalette),
    };
};

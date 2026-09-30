import {
    formatItemValue,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isField,
    isHexCodeColor,
    isMetric,
    isNumericItem,
    isTableCalculation,
    PieChartLegendLabelMaxLengthDefault,
    PieChartLegendPositionDefault,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type ParametersValuesMap,
    type PieChart,
    type PieChartLegendPosition,
    type PieChartValueOptions,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import isEmpty from 'lodash/isEmpty';
import omitBy from 'lodash/omitBy';
import pick from 'lodash/pick';
import pickBy from 'lodash/pickBy';
import { type VisualizationResults } from '../types';

/** One slice of the pie: the rows of a group aggregated into a single value. */
export type PieChartDataPoint = {
    name: string;
    value: number;
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

/**
 * What the pie ECharts builder reads from the editor's config: the valid
 * saved config plus the derivations the editor hook already made from the
 * results. The frontend's `usePieChartConfig` return value satisfies it;
 * `resolvePieChartConfig` produces it headlessly.
 */
export type PieChartBuilderConfig = {
    validConfig: PieChart;
    selectedMetric: Metric | TableCalculation | undefined;
    data: PieChartDataPoint[];
    sortedGroupLabels: string[];
    groupFieldIds: (string | null)[];
};

/** The metric the pie slices are sized by, when `metricId` names a metric or table calculation. */
export const getPieSelectedMetric = (
    itemsMap: ItemsMap | undefined,
    metricId: string | null | undefined,
): Metric | TableCalculation | undefined => {
    if (!itemsMap || !metricId) return undefined;
    const item = itemsMap[metricId];

    if ((isField(item) && isMetric(item)) || isTableCalculation(item))
        return item;

    return undefined;
};

type RepairPieGroupFieldIdsArgs = {
    groupFieldIds: string[];
    /** The dimensions of the last run. */
    dimensionIds: string[];
    /** Dimensions of the not-yet-run query; they survive until results land. */
    pendingDimensionIds: Set<string>;
};

/**
 * Drops group fields that are no longer in the results, falling back to the
 * first dimension when none is left.
 */
export const repairPieGroupFieldIds = ({
    groupFieldIds,
    dimensionIds,
    pendingDimensionIds,
}: RepairPieGroupFieldIdsArgs): string[] => {
    const newGroupFieldIds = groupFieldIds.filter(
        (id) =>
            dimensionIds.includes(id) || (!!id && pendingDimensionIds.has(id)),
    );

    const firstDimensionId = dimensionIds[0];
    if (newGroupFieldIds.length === 0 && firstDimensionId) {
        return [firstDimensionId];
    }

    return newGroupFieldIds;
};

type RepairPieMetricIdArgs = {
    metricId: string | null;
    /** The numeric metrics and table calculations of the last run. */
    allNumericMetricIds: string[];
    /** Metrics of the not-yet-run query; they survive until results land. */
    pendingMetricIds: Set<string>;
    tableCalculationsMetadata?: TableCalculationMetadata[];
};

/**
 * Keeps the selected metric when it is still available, follows a renamed
 * table calculation, and otherwise falls back to the first numeric metric.
 */
export const repairPieMetricId = ({
    metricId,
    allNumericMetricIds,
    pendingMetricIds,
    tableCalculationsMetadata,
}: RepairPieMetricIdArgs): string | null => {
    if (
        metricId &&
        (allNumericMetricIds.includes(metricId) ||
            pendingMetricIds.has(metricId))
    )
        return metricId;

    /**
     * When table calculations update, their name changes, so we need to update the selected fields
     * If the selected field is a table calculation with the old name in the metadata, set it to the new name
     */
    if (tableCalculationsMetadata) {
        const metricTcIndex = tableCalculationsMetadata.findIndex(
            (tc) => tc.oldName === metricId,
        );

        if (metricTcIndex !== -1) {
            return tableCalculationsMetadata[metricTcIndex].name;
        }
    }

    return allNumericMetricIds[0] ?? null;
};

/** Whether any slice overrides the given value option. */
export const isPieValueOptionOverridden = (
    groupValueOptionOverrides: Record<string, Partial<PieChartValueOptions>>,
    option: keyof PieChartValueOptions,
): boolean =>
    Object.values(groupValueOptionOverrides).some(
        (value) => value[option] !== undefined,
    );

type GetPieChartDataArgs = {
    resultsData: VisualizationResults | undefined;
    groupFieldIds: string[];
    metricId: string | null;
    selectedMetric: Metric | TableCalculation | undefined;
    parameters?: ParametersValuesMap;
};

/**
 * Aggregates the result rows into one slice per group: the group name joins
 * the formatted group field values, the value sums the metric, and slices
 * come out largest first.
 */
export const getPieChartData = ({
    resultsData,
    groupFieldIds,
    metricId,
    selectedMetric,
    parameters,
}: GetPieChartDataArgs): PieChartDataPoint[] => {
    if (
        !metricId ||
        !selectedMetric ||
        !resultsData ||
        resultsData.rows.length === 0 ||
        !groupFieldIds ||
        groupFieldIds.length === 0
    ) {
        return [];
    }

    const isMetricPresentInResults = resultsData?.rows.some((r) => r[metricId]);

    if (!isMetricPresentInResults) {
        return [];
    }

    const mappedData = resultsData.rows.map((row) => {
        const name = groupFieldIds
            .map((groupFieldId) => row[groupFieldId]?.value?.formatted)
            .filter(Boolean)
            .join(' - ');

        const value = Number(row[metricId].value.raw);

        return { name, value, row };
    });

    return Object.entries(
        mappedData.reduce<
            Record<
                string,
                {
                    value: number;
                    rows: ResultRow[];
                }
            >
        >((acc, { name, value, row }) => {
            return {
                ...acc,
                [name]: {
                    value: (acc[name]?.value ?? 0) + value,
                    rows: [...(acc[name]?.rows ?? []), row],
                },
            };
        }, {}),
    )
        .map(([name, { value, rows }]) => ({
            name,
            value,
            meta: {
                value: {
                    formatted: formatItemValue(
                        selectedMetric,
                        value,
                        false,
                        parameters,
                        resultsData?.resolvedTimezone,
                    ),
                    raw: value,
                },
                rows,
            },
        }))
        .sort((a, b) => b.value - a.value);
};

/** The group labels in the order the user sorted them, or by value when no override applies. */
export const getSortedPieGroupLabels = (
    groupSortOverrides: string[],
    groupLabels: string[],
): string[] => {
    const availableSortedOverrides = groupSortOverrides.filter((label) =>
        groupLabels.includes(label),
    );

    return availableSortedOverrides.length > 0
        ? availableSortedOverrides
        : groupLabels;
};

/** The palette color each group gets by position, shown in the editor as the default swatch. */
export const getPieGroupColorDefaults = (
    groupLabels: string[],
    colorPalette: string[],
): Record<string, string> =>
    Object.fromEntries(
        groupLabels.map((name, index) => {
            return [name, colorPalette[index % colorPalette.length]];
        }),
    );

export type BuildValidPieConfigArgs = {
    groupFieldIds: string[];
    metricId: string | null;
    isDonut: boolean;
    valueLabel: PieChartValueOptions['valueLabel'];
    showValue: PieChartValueOptions['showValue'];
    showPercentage: PieChartValueOptions['showPercentage'];
    valueLabelColor: PieChartValueOptions['valueLabelColor'];
    /** The labels of the groups in the data; overrides for other groups are dropped. */
    groupLabels: string[];
    groupLabelOverrides: Record<string, string>;
    groupColorOverrides: Record<string, string>;
    groupValueOptionOverrides: Record<string, Partial<PieChartValueOptions>>;
    groupSortOverrides: string[];
    showLegend: boolean;
    legendPosition: PieChartLegendPosition;
    legendMaxItemLength: number | undefined;
};

/** The saved pie config from the editor state, with overrides for missing groups pruned. */
export const buildValidPieConfig = ({
    groupFieldIds,
    metricId,
    isDonut,
    valueLabel,
    showValue,
    showPercentage,
    valueLabelColor,
    groupLabels,
    groupLabelOverrides,
    groupColorOverrides,
    groupValueOptionOverrides,
    groupSortOverrides,
    showLegend,
    legendPosition,
    legendMaxItemLength,
}: BuildValidPieConfigArgs): PieChart => ({
    groupFieldIds,
    metricId: metricId ?? undefined,
    isDonut,
    valueLabel,
    showValue,
    showPercentage,
    valueLabelColor,
    groupLabelOverrides: pick(groupLabelOverrides, groupLabels),
    groupColorOverrides: pickBy(
        pick(groupColorOverrides, groupLabels),
        isHexCodeColor,
    ),
    groupValueOptionOverrides: omitBy(
        pick(groupValueOptionOverrides, groupLabels),
        isEmpty,
    ),
    groupSortOverrides: groupSortOverrides.filter((label) =>
        groupLabels.includes(label),
    ),
    showLegend,
    legendPosition,
    legendMaxItemLength,
});

/** The group and metric pools the pie editor picks from, as the frontend derives them. */
export const getPieFieldPools = (itemsMap: ItemsMap | undefined) => {
    const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
    const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);
    return {
        dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
        numericMetrics: { ...metrics, ...tableCalculations },
    };
};

export type ResolvePieChartConfigArgs = {
    chartConfig: PieChart | undefined;
    resultsData: VisualizationResults | undefined;
    itemsMap: ItemsMap | undefined;
    colorPalette: string[];
    /** The group pool; derived from `itemsMap` when left out. */
    dimensions?: Record<string, CustomDimension | Dimension>;
    /** The metric pool; derived from `itemsMap` when left out. */
    numericMetrics?: Record<string, Metric | TableCalculation>;
    tableCalculationsMetadata?: TableCalculationMetadata[];
    parameters?: ParametersValuesMap;
    /** The not-yet-run metric query; its fields count as valid group/metric references. */
    unsavedMetricQuery?: MetricQuery;
};

export type ResolvedPieChartConfig = PieChartBuilderConfig & {
    metricId: string | null;
    groupFieldIds: string[];
    groupLabels: string[];
    groupColorDefaults: Record<string, string>;
};

/**
 * Resolves a saved pie config against query results, the way the explorer
 * does when it first mounts a chart: drops group fields and metrics that
 * left the results, picks defaults, aggregates the slices and prunes
 * overrides for groups that are gone.
 *
 * The frontend's `usePieChartConfig` runs the same steps inside its effects
 * and memos; this is the one-shot equivalent for headless rendering. Without
 * results the config is returned as the hook holds it before loading: no
 * repairs and no slices.
 */
export const resolvePieChartConfig = ({
    chartConfig: pieChartConfig,
    resultsData,
    itemsMap,
    colorPalette,
    dimensions,
    numericMetrics,
    tableCalculationsMetadata,
    parameters,
    unsavedMetricQuery,
}: ResolvePieChartConfigArgs): ResolvedPieChartConfig => {
    const pools = getPieFieldPools(itemsMap);
    const dimensionIds = Object.keys(dimensions ?? pools.dimensions);
    const allNumericMetricIds = Object.keys(
        numericMetrics ?? pools.numericMetrics,
    );

    const isLoading = !resultsData;

    // The pools above only know the last run; a field just added from the
    // config picker must not be dropped before its results land.
    const pendingDimensionIds = new Set(unsavedMetricQuery?.dimensions);
    const pendingMetricIds = new Set(unsavedMetricQuery?.metrics);

    let groupFieldIds = pieChartConfig?.groupFieldIds ?? [];
    if (!isLoading && dimensionIds.length > 0) {
        groupFieldIds = repairPieGroupFieldIds({
            groupFieldIds,
            dimensionIds,
            pendingDimensionIds,
        });
    }

    let metricId = pieChartConfig?.metricId ?? null;
    if (!isLoading && allNumericMetricIds.length > 0) {
        // Twice: a renamed table calculation is first followed to its new
        // name, then dropped if that name is not in the pool, which is what
        // the editor settles on over two renders.
        const repair = (id: string | null) =>
            repairPieMetricId({
                metricId: id,
                allNumericMetricIds,
                pendingMetricIds,
                tableCalculationsMetadata,
            });
        metricId = repair(repair(metricId));
    }

    const isDonut = pieChartConfig?.isDonut ?? true;
    const valueLabel = pieChartConfig?.valueLabel ?? 'hidden';
    const showValue = pieChartConfig?.showValue ?? false;
    const showPercentage = pieChartConfig?.showPercentage ?? true;
    const valueLabelColor = pieChartConfig?.valueLabelColor;
    const groupLabelOverrides = pieChartConfig?.groupLabelOverrides ?? {};
    const groupColorOverrides = pieChartConfig?.groupColorOverrides ?? {};
    const groupValueOptionOverrides =
        pieChartConfig?.groupValueOptionOverrides ?? {};
    const groupSortOverrides = pieChartConfig?.groupSortOverrides ?? [];
    const showLegend = pieChartConfig?.showLegend ?? true;
    const legendPosition =
        pieChartConfig?.legendPosition ?? PieChartLegendPositionDefault;
    const legendMaxItemLength =
        pieChartConfig?.legendMaxItemLength ??
        PieChartLegendLabelMaxLengthDefault;

    const selectedMetric = getPieSelectedMetric(itemsMap, metricId);

    const data = getPieChartData({
        resultsData,
        groupFieldIds,
        metricId,
        selectedMetric,
        parameters,
    });

    const groupLabels = data.map(({ name }) => name);
    const sortedGroupLabels = getSortedPieGroupLabels(
        groupSortOverrides,
        groupLabels,
    );
    const groupColorDefaults = getPieGroupColorDefaults(
        groupLabels,
        colorPalette,
    );

    const validConfig = buildValidPieConfig({
        groupFieldIds,
        metricId,
        isDonut,
        valueLabel,
        showValue,
        showPercentage,
        valueLabelColor,
        groupLabels,
        groupLabelOverrides,
        groupColorOverrides,
        groupValueOptionOverrides,
        groupSortOverrides,
        showLegend,
        legendPosition,
        legendMaxItemLength,
    });

    return {
        validConfig,
        metricId,
        selectedMetric,
        groupFieldIds,
        data,
        groupLabels,
        sortedGroupLabels,
        groupColorDefaults,
    };
};

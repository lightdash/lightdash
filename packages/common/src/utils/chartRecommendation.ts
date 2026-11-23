import { ChartKind } from '../types/savedCharts';

export const MAX_VERTICAL_BAR_CATEGORIES = 10;
export const MAX_HORIZONTAL_BAR_CATEGORIES = 20;
export const TOP_N_CATEGORIES = 20;
export const LONG_LABEL_CHARACTERS = 20;
export const MAX_LINE_METRICS = 3;
export const MAX_LINE_SERIES = 4;
export const MAX_GROUPED_BAR_CATEGORIES = 10;
export const MAX_GROUPED_BAR_SERIES = 4;
export const MAX_GROUPED_BAR_METRICS = 3;
export const BAR_AS_GOOD_AS_LINE_PERIODS = 10;

export type ChartShapeDimension = {
    fieldId: string;
    label: string;
    isTime: boolean;
    distinctValueCount?: number;
    longestValueLength?: number;
};

export type ChartShapeValue = {
    fieldId: string;
    label: string;
    unit?: string | null;
};

export type ChartResultShape = {
    dimensions: ChartShapeDimension[];
    metrics: ChartShapeValue[];
    tableCalculations: ChartShapeValue[];
    rowCount: number;
};

export type RecommendedChartKind =
    | ChartKind.TABLE
    | ChartKind.BIG_NUMBER
    | ChartKind.LINE
    | ChartKind.VERTICAL_BAR
    | ChartKind.HORIZONTAL_BAR;

export type ChartRecommendation = {
    kind: RecommendedChartKind;
    xField?: string;
    yFields: string[];
    groupBy?: string;
    sort?: { fieldId: string; descending: boolean };
    topN?: { count: number; total: number };
    reason: string;
};

const table = (reason: string): ChartRecommendation => ({
    kind: ChartKind.TABLE,
    yFields: [],
    reason,
});

const lowerFirst = (label: string) =>
    label.charAt(0).toLowerCase() + label.slice(1);

const shareUnit = (values: ChartShapeValue[]) =>
    values.every((value) => !!value.unit && value.unit === values[0].unit);

const recommendOneCategory = (
    dimension: ChartShapeDimension,
    value: ChartShapeValue,
    rowCount: number,
): ChartRecommendation => {
    const categories = Math.max(dimension.distinctValueCount ?? 0, rowCount);
    const hasLongLabels =
        (dimension.longestValueLength ?? 0) > LONG_LABEL_CHARACTERS;
    const base = {
        xField: dimension.fieldId,
        yFields: [value.fieldId],
        sort: { fieldId: value.fieldId, descending: true },
    };
    const name = lowerFirst(dimension.label);
    if (categories <= MAX_VERTICAL_BAR_CATEGORIES && !hasLongLabels) {
        return {
            ...base,
            kind: ChartKind.VERTICAL_BAR,
            reason: `Bar chart: ${categories} ${name} values compared by ${lowerFirst(value.label)}, largest first.`,
        };
    }
    if (categories <= MAX_HORIZONTAL_BAR_CATEGORIES) {
        return {
            ...base,
            kind: ChartKind.HORIZONTAL_BAR,
            reason: hasLongLabels
                ? `Horizontal bar chart: ${name} labels are long, so they read across. Largest at the top.`
                : `Horizontal bar chart: ${categories} ${name} values fit better down the page. Largest at the top.`,
        };
    }
    return {
        ...base,
        kind: ChartKind.HORIZONTAL_BAR,
        topN: { count: TOP_N_CATEGORIES, total: categories },
        reason: `Horizontal bar chart of the top ${TOP_N_CATEGORIES} of ${categories} ${name} values by ${lowerFirst(value.label)}. The rest are in the results table.`,
    };
};

const recommendOneDimension = (
    dimension: ChartShapeDimension,
    values: ChartShapeValue[],
    rowCount: number,
): ChartRecommendation => {
    if (dimension.isTime) {
        if (values.length > MAX_LINE_METRICS) {
            return table(
                `Table: ${values.length} metrics over time are too many lines to read.`,
            );
        }
        const periods = dimension.distinctValueCount ?? rowCount;
        return {
            kind: ChartKind.LINE,
            xField: dimension.fieldId,
            yFields: values.map((value) => value.fieldId),
            reason:
                values.length === 1
                    ? `Line chart: ${lowerFirst(values[0].label)} over ${lowerFirst(dimension.label)}${periods <= BAR_AS_GOOD_AS_LINE_PERIODS ? '. A bar chart works as well for this few periods.' : '.'}`
                    : `Line chart: ${values.length} metrics over ${lowerFirst(dimension.label)} as lines on one axis.`,
        };
    }
    if (values.length === 1) {
        return recommendOneCategory(dimension, values[0], rowCount);
    }
    if (values.length > MAX_GROUPED_BAR_METRICS) {
        return table(
            `Table: ${values.length} metrics per ${lowerFirst(dimension.label)} are easier to read as columns.`,
        );
    }
    const categories = Math.max(dimension.distinctValueCount ?? 0, rowCount);
    if (!shareUnit(values)) {
        return table(
            `Table: the metrics do not share a unit, so bars side by side would mislead.`,
        );
    }
    if (categories > MAX_GROUPED_BAR_CATEGORIES) {
        return table(
            `Table: ${categories} ${lowerFirst(dimension.label)} values with ${values.length} metrics each are too many bars.`,
        );
    }
    return {
        kind: ChartKind.VERTICAL_BAR,
        xField: dimension.fieldId,
        yFields: values.map((value) => value.fieldId),
        sort: { fieldId: values[0].fieldId, descending: true },
        reason: `Grouped bar chart: ${values.length} metrics in the same unit for each ${lowerFirst(dimension.label)}.`,
    };
};

const recommendTwoDimensions = (
    dimensions: [ChartShapeDimension, ChartShapeDimension],
    value: ChartShapeValue,
): ChartRecommendation => {
    const times = dimensions.filter((dimension) => dimension.isTime);
    if (times.length === 2) {
        return table('Table: two time dimensions do not make one time axis.');
    }
    if (dimensions.some((d) => d.distinctValueCount === undefined)) {
        return table(
            'Table: the number of values per dimension is not known yet.',
        );
    }
    if (times.length === 1) {
        const time = times[0];
        const category = dimensions.find((d) => !d.isTime)!;
        const series = category.distinctValueCount!;
        if (series > MAX_LINE_SERIES) {
            return table(
                `Table: ${series} ${lowerFirst(category.label)} values would be ${series} lines, more than ${MAX_LINE_SERIES} is hard to tell apart.`,
            );
        }
        return {
            kind: ChartKind.LINE,
            xField: time.fieldId,
            yFields: [value.fieldId],
            groupBy: category.fieldId,
            reason: `Line chart: ${lowerFirst(value.label)} over ${lowerFirst(time.label)}, one line per ${lowerFirst(category.label)}.`,
        };
    }
    const [axis, group] = [...dimensions].sort(
        (a, b) => b.distinctValueCount! - a.distinctValueCount!,
    );
    if (
        axis.distinctValueCount! > MAX_GROUPED_BAR_CATEGORIES ||
        group.distinctValueCount! > MAX_GROUPED_BAR_SERIES
    ) {
        return table(
            `Table: ${axis.distinctValueCount} × ${group.distinctValueCount} combinations are too many bars.`,
        );
    }
    return {
        kind: ChartKind.VERTICAL_BAR,
        xField: axis.fieldId,
        yFields: [value.fieldId],
        groupBy: group.fieldId,
        reason: `Grouped bar chart: ${lowerFirst(value.label)} by ${lowerFirst(axis.label)}, one bar per ${lowerFirst(group.label)}.`,
    };
};

/**
 * Picks a chart for an Explore result from its shape alone: the fields, which
 * is time, how many rows and how many values each dimension has. Never sums
 * values, so a non-additive metric such as a distinct count is safe: a top N
 * cut only draws the first N rows of the query's own sort.
 */
export const recommendChart = ({
    dimensions,
    metrics,
    tableCalculations,
    rowCount,
}: ChartResultShape): ChartRecommendation => {
    const values = [...metrics, ...tableCalculations];
    if (values.length === 0) {
        return table('Table: there is no metric to plot.');
    }
    if (dimensions.length === 0) {
        return values.length === 1 && rowCount === 1
            ? {
                  kind: ChartKind.BIG_NUMBER,
                  yFields: [values[0].fieldId],
                  reason: `Big number: one value for ${lowerFirst(values[0].label)}.`,
              }
            : table('Table: several values with nothing to compare them by.');
    }
    if (dimensions.length >= 3) {
        return table(
            `Table: ${dimensions.length} dimensions are too many to draw at once.`,
        );
    }
    if (values.length > MAX_GROUPED_BAR_METRICS) {
        return table(
            `Table: ${values.length} metrics are easier to read as columns.`,
        );
    }
    if (dimensions.length === 1) {
        return recommendOneDimension(dimensions[0], values, rowCount);
    }
    if (values.length > 1) {
        return table(
            'Table: two dimensions with several metrics are easier to read as columns.',
        );
    }
    return recommendTwoDimensions([dimensions[0], dimensions[1]], values[0]);
};

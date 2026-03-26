import {
    FilterOperator,
    hashFieldReference,
    type CartesianSeriesHighlight,
    type EChartsSeries,
    type Series,
} from '@lightdash/common';

type HighlightSeries = Pick<
    Series,
    'encode' | 'highlight' | 'hidden' | 'isFilteredOut' | 'type'
>;

type ActiveSeriesHighlight = {
    highlight: CartesianSeriesHighlight;
    yReferenceKey: string;
};

const compareNumberValues = (
    operator: FilterOperator,
    currentValue: number,
    targetValue: number,
) => {
    switch (operator) {
        case FilterOperator.EQUALS:
            return currentValue === targetValue;
        case FilterOperator.NOT_EQUALS:
            return currentValue !== targetValue;
        case FilterOperator.GREATER_THAN:
            return currentValue > targetValue;
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return currentValue >= targetValue;
        case FilterOperator.LESS_THAN:
            return currentValue < targetValue;
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return currentValue <= targetValue;
        default:
            return false;
    }
};

const getSeriesRowValue = (
    series: EChartsSeries,
    rowValues: Record<string, unknown>,
) => {
    const encodedTooltipField = series.encode?.tooltip?.[0];
    if (
        typeof encodedTooltipField === 'string' &&
        rowValues[encodedTooltipField] !== undefined
    ) {
        return rowValues[encodedTooltipField];
    }

    const encodedYField = series.encode?.y;
    if (
        typeof encodedYField === 'string' &&
        rowValues[encodedYField] !== undefined
    ) {
        return rowValues[encodedYField];
    }

    const seriesFieldId = series.encode?.yRef?.field;
    return seriesFieldId ? rowValues[seriesFieldId] : undefined;
};

const getPersistedSeriesReferenceKey = (series: HighlightSeries): string =>
    hashFieldReference(series.encode.yRef);

const getRuntimeSeriesReferenceKey = (
    series: EChartsSeries,
): string | undefined => {
    if (series.pivotReference) {
        return hashFieldReference(series.pivotReference);
    }

    if (series.encode?.yRef) {
        return hashFieldReference(series.encode.yRef);
    }

    return series.encode?.y;
};

export const getActiveCartesianSeriesHighlight = (
    series: HighlightSeries[] | undefined,
): ActiveSeriesHighlight | undefined => {
    const highlightedSeries = series?.find(
        (entry) => !entry.hidden && !entry.isFilteredOut && entry.highlight,
    );

    if (!highlightedSeries?.highlight) {
        return undefined;
    }

    return {
        highlight: highlightedSeries.highlight,
        yReferenceKey: getPersistedSeriesReferenceKey(highlightedSeries),
    };
};

export const matchesSeriesHighlightValue = ({
    highlight,
    value,
}: {
    highlight: CartesianSeriesHighlight;
    value: unknown;
}) => {
    if (!highlight.operator) {
        return true;
    }

    if (highlight.value === undefined || highlight.value === null) {
        return false;
    }

    const numericValue =
        typeof value === 'number' ? value : Number(value ?? Number.NaN);

    if (Number.isNaN(numericValue)) {
        return false;
    }

    return compareNumberValues(
        highlight.operator,
        numericValue,
        highlight.value,
    );
};

export const getLineSeriesHighlightColor = ({
    activeHighlight,
    series,
}: {
    activeHighlight: ActiveSeriesHighlight | undefined;
    series: EChartsSeries;
}) => {
    if (!activeHighlight) {
        return undefined;
    }

    return getRuntimeSeriesReferenceKey(series) ===
        activeHighlight.yReferenceKey
        ? activeHighlight.highlight.color
        : activeHighlight.highlight.othersColor;
};

export const getBarSeriesHighlightColor = ({
    activeHighlight,
    rowValues,
    series,
}: {
    activeHighlight: ActiveSeriesHighlight | undefined;
    rowValues: Record<string, unknown>;
    series: EChartsSeries;
}) => {
    if (!activeHighlight) {
        return undefined;
    }

    if (
        getRuntimeSeriesReferenceKey(series) !== activeHighlight.yReferenceKey
    ) {
        return activeHighlight.highlight.othersColor;
    }

    return matchesSeriesHighlightValue({
        highlight: activeHighlight.highlight,
        value: getSeriesRowValue(series, rowValues),
    })
        ? activeHighlight.highlight.color
        : activeHighlight.highlight.othersColor;
};

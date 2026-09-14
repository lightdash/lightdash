import {
    createDashboardFilterRuleFromField,
    getDimensions,
    getFields,
    getItemId,
    getItemMap,
    type ApiExploreResults,
    type EChartsSeries,
    type SavedChart,
} from '@lightdash/common';
import { getDataFromChartClick } from '../MetricQueryData/utils';
import { type EchartsSeriesClickEvent } from '../SimpleChart';

type DashboardChartContext = Pick<SavedChart, 'metricQuery' | 'pivotConfig'>;

export const shouldOpenEmbeddedChartContextMenu = ({
    canViewUnderlyingData,
    canExplore,
    canCrossFilter,
    dashboardTileFilterOptionsCount,
}: {
    canViewUnderlyingData: boolean;
    canExplore: boolean;
    canCrossFilter: boolean;
    dashboardTileFilterOptionsCount: number;
}) =>
    canViewUnderlyingData ||
    canExplore ||
    (canCrossFilter && dashboardTileFilterOptionsCount > 0);

export const getDashboardTileContextMenuOptions = ({
    clickEvent,
    series,
    explore,
    chart,
}: {
    clickEvent: EchartsSeriesClickEvent;
    series: EChartsSeries[];
    explore: ApiExploreResults;
    chart: DashboardChartContext;
}) => {
    const allDimensions = getDimensions(explore);
    const allItemsMap = getItemMap(
        explore,
        chart.metricQuery.additionalMetrics,
        chart.metricQuery.tableCalculations,
        chart.metricQuery.customDimensions,
    );

    const clickedColumnNames = new Set([
        ...clickEvent.dimensionNames,
        ...Object.keys(clickEvent.datasetRow ?? {}),
    ]);
    const exploreDimensions = allDimensions.filter((dimension) =>
        clickedColumnNames.has(getItemId(dimension)),
    );

    const getValueFromClickData = (fieldId: string) => {
        if (Array.isArray(clickEvent.value)) {
            const index = clickEvent.dimensionNames.indexOf(fieldId);
            if (index >= 0) return clickEvent.value[index];
            return clickEvent.datasetRow?.[fieldId];
        }
        return (clickEvent.data as Record<string, unknown>)[fieldId];
    };

    const dimensionOptions = exploreDimensions.map((field) =>
        createDashboardFilterRuleFromField({
            field,
            availableTileFilters: {},
            isTemporary: true,
            value: getValueFromClickData(getItemId(field)),
        }),
    );

    const clickedSeries = series[clickEvent.seriesIndex];
    const fields = getFields(explore);
    const pivot = chart.pivotConfig?.columns?.[0];
    const pivotField = fields.find(
        (field) => `${field.table}_${field.name}` === pivot,
    );
    const seriesName = clickedSeries.encode?.seriesName;

    let pivotValue =
        pivot && seriesName?.includes(`.${pivot}.`)
            ? seriesName.split(`.${pivot}.`)[1]
            : undefined;

    if (!pivotValue && clickedSeries.pivotReference?.pivotValues) {
        const pivotReferenceValue =
            clickedSeries.pivotReference.pivotValues.find(
                (value) => value.field === pivot,
            );
        if (pivotReferenceValue) {
            pivotValue = pivotReferenceValue.value as string;
        }
    }

    const pivotOptions =
        pivot && pivotField && pivotValue
            ? [
                  createDashboardFilterRuleFromField({
                      field: pivotField,
                      availableTileFilters: {},
                      isTemporary: true,
                      value: pivotValue,
                  }),
              ]
            : [];

    return {
        dashboardTileFilterOptions: [...dimensionOptions, ...pivotOptions],
        viewUnderlyingDataOptions: {
            ...getDataFromChartClick(clickEvent, allItemsMap, series),
            dimensions: chart.metricQuery.dimensions ?? [],
        },
    };
};

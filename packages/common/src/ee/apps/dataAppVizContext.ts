import { type ReadyQueryResultsPage } from '../../types/api';
import { isDimension, type ItemsMap } from '../../types/field';
import { type ResultRow } from '../../types/results';
import {
    CartesianSeriesType,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
} from '../../types/savedCharts';
import {
    calculateKeyColorAssignment,
    calculateSeriesColorAssignment,
    type ColorAssignmentOptions,
} from '../../visualizations/colors/mappings';
import {
    calculateFallbackSeriesColors,
    calculateSeriesLikeIdentifier,
    getDimensionValueColor,
} from '../../visualizations/colors/series';
import { type EChartsSeries } from '../../visualizations/types';
import {
    deriveDataAppVizFieldMetadata,
    getDataAppVizFieldIds,
} from './dataAppVizFieldMapping';
import {
    getEffectiveOptionValues,
    type DataAppVizContext,
    type DataAppVizSchema,
} from './types';

export type DataAppVizResolvedColors = Pick<
    DataAppVizContext,
    'seriesColors' | 'valueColors'
>;

type ResolveDataAppVizColorsArgs = ColorAssignmentOptions & {
    itemsMap: ItemsMap;
    rows: ResultRow[];
    fieldMapping: DataAppVizFieldMapping;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    isCalculateSeriesColorEnabled: boolean;
};

/** Series and dimension value colours for a viz, assigned through the shared
 *  `colorMappings` so they match the built-in charts on the same page. */
export const resolveDataAppVizColors = ({
    itemsMap,
    rows,
    fieldMapping,
    pivotDetails,
    colorPalette,
    colorMappings,
    nullColor,
    isCalculateSeriesColorEnabled,
}: ResolveDataAppVizColorsArgs): DataAppVizResolvedColors => {
    const assignment: ColorAssignmentOptions = {
        colorPalette,
        colorMappings,
        nullColor,
    };
    const columnSeries = (pivotDetails?.valuesColumns ?? []).map((column) => {
        const series: EChartsSeries = {
            type: CartesianSeriesType.BAR,
            pivotReference: {
                field: column.referenceField,
                pivotValues: column.pivotValues.map(
                    ({ referenceField, value }) => ({
                        field: referenceField,
                        value,
                    }),
                ),
            },
        };
        return { column, series };
    });
    const fallbackColors = calculateFallbackSeriesColors(
        columnSeries.map(({ series }) => series),
        colorPalette,
    );
    const seriesColors = Object.fromEntries(
        columnSeries.flatMap(({ column, series }) => {
            const firstPivotValue = column.pivotValues[0];
            const fixedColor = firstPivotValue
                ? getDimensionValueColor(
                      itemsMap,
                      firstPivotValue.referenceField,
                      firstPivotValue.value,
                  )
                : undefined;
            const paletteColor: string | undefined =
                colorPalette.length > 0
                    ? fallbackColors[
                          calculateSeriesLikeIdentifier(series).join('|')
                      ]
                    : undefined;
            const color =
                fixedColor ??
                (isCalculateSeriesColorEnabled
                    ? calculateSeriesColorAssignment(assignment, series)
                    : paletteColor);

            return color === undefined
                ? []
                : [[column.pivotColumnName, color] as const];
        }),
    );

    const valueColors = Object.fromEntries(
        [
            ...new Set(
                Object.values(fieldMapping).flatMap(getDataAppVizFieldIds),
            ),
        ].flatMap((fieldId) => {
            const item = itemsMap[fieldId];
            if (!item || !isDimension(item)) return [];

            // Keyed by raw value for the viz, resolved by formatted value
            // like a built-in pie names its groups.
            const formattedByRaw = new Map<string, string>();
            rows.forEach((row) => {
                const cell = row[fieldId]?.value;
                if (cell === undefined || cell.raw === undefined) return;
                const key = String(cell.raw);
                if (!formattedByRaw.has(key)) {
                    formattedByRaw.set(key, cell.formatted);
                }
            });
            const colors = Object.fromEntries(
                [...formattedByRaw].map(([key, formatted]) => [
                    key,
                    getDimensionValueColor(itemsMap, fieldId, formatted) ??
                        calculateKeyColorAssignment(
                            assignment,
                            fieldId,
                            formatted,
                        ),
                ]),
            );

            return [[fieldId, colors] as const];
        }),
    );

    return { seriesColors, valueColors };
};

type BuildDataAppVizContextArgs = {
    schema: DataAppVizSchema;
    itemsMap: ItemsMap;
    fieldMapping: DataAppVizFieldMapping;
    rows: ResultRow[];
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    colorPalette: string[];
    optionValues: DataAppVizOptionValues;
    resolvedColors: DataAppVizResolvedColors;
};

/** A `DataAppVizContext` for one result set. Not a saved chart, so nothing
 *  to drill into and no subtotals. */
export const buildDataAppVizContext = ({
    schema,
    itemsMap,
    fieldMapping,
    rows,
    pivotDetails,
    colorPalette,
    optionValues,
    resolvedColors,
}: BuildDataAppVizContextArgs): DataAppVizContext => ({
    fieldMapping,
    fields: deriveDataAppVizFieldMetadata(fieldMapping, itemsMap),
    rows,
    options: getEffectiveOptionValues(schema.configOptions, optionValues),
    colorPalette,
    ...resolvedColors,
    pivotDetails,
    underlyingData: { enabled: false },
    drillDown: { enabled: false },
    pointMenu: { enabled: false },
    subtotals: { enabled: false, dimensions: [] },
});

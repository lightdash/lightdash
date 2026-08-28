import {
    CartesianSeriesType,
    FeatureFlags,
    isDimension,
    type DataAppVizContext,
    type EChartsSeries,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useChartColorConfig } from '../../../hooks/useChartColorConfig/useChartColorConfig';
import {
    calculateFallbackSeriesColors,
    calculateSeriesLikeIdentifier,
    getDimensionValueColor,
} from '../../../hooks/useChartColorConfig/utils';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

type Args = {
    itemsMap: ItemsMap;
    rows: ResultRow[];
    fieldMapping: Record<string, string>;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    colorPalette: string[];
};

export type DataAppVizResolvedColors = Pick<
    DataAppVizContext,
    'seriesColors' | 'valueColors'
>;

export const useDataAppVizResolvedColors = ({
    itemsMap,
    rows,
    fieldMapping,
    pivotDetails,
    colorPalette,
}: Args): DataAppVizResolvedColors => {
    const { calculateKeyColorAssignment, calculateSeriesColorAssignment } =
        useChartColorConfig({ colorPalette });
    const { data: calculateSeriesColorFlag } = useServerFeatureFlag(
        FeatureFlags.CalculateSeriesColor,
    );
    const isCalculateSeriesColorEnabled =
        calculateSeriesColorFlag?.enabled ?? false;

    return useMemo(() => {
        const columnSeries = (pivotDetails?.valuesColumns ?? []).map(
            (column) => {
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
            },
        );
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
                        ? calculateSeriesColorAssignment(series)
                        : paletteColor);

                return color === undefined
                    ? []
                    : [[column.pivotColumnName, color] as const];
            }),
        );

        const valueColors = Object.fromEntries(
            [...new Set(Object.values(fieldMapping))].flatMap((fieldId) => {
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
                            calculateKeyColorAssignment(fieldId, formatted),
                    ]),
                );

                return [[fieldId, colors] as const];
            }),
        );

        return { seriesColors, valueColors };
    }, [
        calculateKeyColorAssignment,
        calculateSeriesColorAssignment,
        colorPalette,
        fieldMapping,
        isCalculateSeriesColorEnabled,
        itemsMap,
        pivotDetails,
        rows,
    ]);
};

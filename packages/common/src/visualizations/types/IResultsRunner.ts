import {
    type PivotChartData,
    type VizCartesianChartOptions,
    type VizConfigErrors,
} from '.';
import { type RawResultRow } from '../../types/results';

export interface IResultsRunner<TPivotChartLayout> {
    // Includes bar, chart, line, pie, scatter, and table v1(?)
    getPivotedVisualizationData(
        config: TPivotChartLayout,
        sql?: string,
        projectUuid?: string,
        limit?: number,
        slug?: string,
        uuid?: string,
        context?: string,
    ): Promise<PivotChartData>;

    defaultPivotChartLayout(): TPivotChartLayout | undefined;

    mergePivotChartLayout(
        existingConfig?: TPivotChartLayout,
    ): TPivotChartLayout | undefined;

    pivotChartOptions(): VizCartesianChartOptions;

    getPivotChartLayoutErrors(
        config: TPivotChartLayout | undefined,
    ): VizConfigErrors | undefined;

    getColumns(): string[];

    getColumnsAccessorFn(
        column: string,
    ): (row: RawResultRow) => RawResultRow[string];

    getRows(): RawResultRow[];

    // TODO: other runner types
    // getPivotTableData() // includes subtotalling etc.
    // getEventAnalyticsData() // funnel building + sankey
    // getTimeSeriesData() // period-over-period and overlay multiple time series
    // getMapData() // detailed mapping
    // where does big number live?
}

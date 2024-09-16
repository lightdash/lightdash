import {
    type PivotChartData,
    type VizAggregationOptions,
    type VizCartesianChartOptions,
    type VizIndexType,
} from '.';
import { type RawResultRow } from '../../types/results';

// TODO: move these types out of here
export type SqlRunnerPivotChartLayout = {
    x:
        | {
              reference: string;
              type: VizIndexType;
          }
        | undefined;
    y: {
        reference: string;
        aggregation: VizAggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
};

export type SemanticViewerPivotChartLayout = {
    x:
        | {
              reference: string;
              type: VizIndexType;
          }
        | undefined;
    y: {
        reference: string;
    }[];
    groupBy: { reference: string }[] | undefined;
};

// TODO er: maybe this shouldnt actually go here at all
export type PivotChartLayout =
    | SqlRunnerPivotChartLayout
    | SemanticViewerPivotChartLayout;

export interface IResultsRunner {
    // Includes bar, chart, line, pie, scatter, and table v1(?)

    // Why does this have so many parameters not relevant to the runner?
    // Can this operate on almost no params?
    getPivotedVisualizationData(
        config: PivotChartLayout,
        sql?: string,
        projectUuid?: string,
        limit?: number,
        slug?: string,
        uuid?: string,
    ): Promise<PivotChartData>;

    defaultPivotChartLayout(): PivotChartLayout | undefined; // Maybe should be on the DM

    mergePivotChartLayout(
        existingConfig?: PivotChartLayout,
    ): PivotChartLayout | undefined;

    pivotChartOptions(): VizCartesianChartOptions;

    // Sql specific?
    getColumns(): string[];

    // Sql specific?
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

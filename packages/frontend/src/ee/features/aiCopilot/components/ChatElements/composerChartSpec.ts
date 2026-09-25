import {
    assertUnreachable,
    BigNumberDataModel,
    buildComposerChartData,
    CartesianChartDataModel,
    ChartKind,
    PieChartDataModel,
    type AnyType,
    type BigNumberSpec,
    type ComposerChartKind,
    type ComposerVizAxes,
    type PivotChartLayout,
    type RawResultRow,
    type ResultColumn,
} from '@lightdash/common';
import { SqlChartResultsRunner } from '../../../../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';
import { type ComposerSeriesSplitResult } from './useComposerSeriesSplit';

type EChartsSpec = Record<string, AnyType>;

export type ComposerChartSpec =
    | { kind: 'echarts'; option: EChartsSpec }
    | { kind: 'big_number'; spec: BigNumberSpec | undefined };

export type ComposerCartesianKind = Extract<ComposerChartKind, 'bar' | 'line'>;

const chartQuery = (limit: number) => ({
    sql: '',
    limit,
    sortBy: [],
    filters: [],
});

const buildCartesianSpec = async ({
    resultsRunner,
    layout,
    kind,
    colors,
    limit,
}: {
    resultsRunner: SqlChartResultsRunner;
    layout: PivotChartLayout;
    kind: ComposerCartesianKind;
    colors: string[];
    limit: number;
}): Promise<EChartsSpec> => {
    const model = new CartesianChartDataModel({
        resultsRunner,
        fieldConfig: layout,
        type: kind === 'bar' ? ChartKind.VERTICAL_BAR : ChartKind.LINE,
    });
    await model.getPivotedChartData(chartQuery(limit));
    return model.getSpec(undefined, colors);
};

/**
 * Builds the chart of a node result from rows already fetched, through the
 * DataViz data models over a constant-function results runner. No server call.
 */
export const buildComposerChartSpec = async ({
    kind,
    columns,
    rows,
    axes,
    colors,
}: {
    kind: ComposerChartKind;
    columns: ResultColumn[];
    rows: RawResultRow[];
    axes: Pick<ComposerVizAxes, 'x' | 'y'>;
    colors: string[];
}): Promise<ComposerChartSpec> => {
    const { data, layout } = buildComposerChartData({ rows, ...axes });
    const resultsRunner = new SqlChartResultsRunner({
        pivotChartData: data,
        originalColumns: Object.fromEntries(
            columns.map((column) => [column.reference, column]),
        ),
    });
    const query = chartQuery(rows.length);

    switch (kind) {
        case 'bar':
        case 'line':
            return {
                kind: 'echarts',
                option: await buildCartesianSpec({
                    resultsRunner,
                    layout,
                    kind,
                    colors,
                    limit: rows.length,
                }),
            };
        case 'pie': {
            const model = new PieChartDataModel({
                resultsRunner,
                fieldConfig: layout,
            });
            await model.getPivotedChartData(query);
            return {
                kind: 'echarts',
                option: { color: colors, ...model.getSpec() },
            };
        }
        case 'big_number': {
            const model = new BigNumberDataModel({
                resultsRunner,
                fieldConfig: layout,
            });
            await model.getPivotedChartData(query);
            return { kind: 'big_number', spec: model.getSpec() };
        }
        default:
            return assertUnreachable(kind, 'Unknown composer chart kind');
    }
};

/** Multi-series bar/line from a server-pivoted result; one series per groupBy value. */
export const buildComposerSeriesSplitSpec = async ({
    kind,
    result,
    layout,
    colors,
}: {
    kind: ComposerCartesianKind;
    result: ComposerSeriesSplitResult;
    layout: PivotChartLayout;
    colors: string[];
}): Promise<EChartsSpec> =>
    buildCartesianSpec({
        resultsRunner: new SqlChartResultsRunner(result),
        layout,
        kind,
        colors,
        limit: result.pivotChartData.results.length,
    });

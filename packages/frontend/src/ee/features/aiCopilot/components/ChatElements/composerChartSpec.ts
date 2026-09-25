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
    type PivotChartLayout,
    type RawResultRow,
    type ResultColumn,
} from '@lightdash/common';
import { SqlChartResultsRunner } from '../../../../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';
import { type ComposerPivotResult } from './useComposerPivot';

type EChartsSpec = Record<string, AnyType>;

export type ComposerChartSpec =
    | { kind: 'echarts'; option: EChartsSpec }
    | { kind: 'big_number'; spec: BigNumberSpec | undefined };

const chartQuery = (limit: number) => ({
    sql: '',
    limit,
    sortBy: [],
    filters: [],
});

/** Runs a chart kind's DataViz data model over a constant-function results runner. */
const buildSpec = async ({
    kind,
    resultsRunner,
    layout,
    colors,
    limit,
}: {
    kind: ComposerChartKind;
    resultsRunner: SqlChartResultsRunner;
    layout: PivotChartLayout;
    colors: string[];
    limit: number;
}): Promise<ComposerChartSpec> => {
    const query = chartQuery(limit);
    switch (kind) {
        case 'bar':
        case 'line': {
            const model = new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: layout,
                type: kind === 'bar' ? ChartKind.VERTICAL_BAR : ChartKind.LINE,
            });
            await model.getPivotedChartData(query);
            return { kind: 'echarts', option: model.getSpec(undefined, colors) };
        }
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

/** The chart of a node result from rows already fetched: x as the index, each y as a series. No server call. */
export const buildComposerChartSpec = async ({
    kind,
    columns,
    rows,
    x,
    y,
    colors,
}: {
    kind: ComposerChartKind;
    columns: ResultColumn[];
    rows: RawResultRow[];
    x: ResultColumn | null;
    y: ResultColumn[];
    colors: string[];
}): Promise<ComposerChartSpec> => {
    const { data, layout } = buildComposerChartData({ rows, x, y });
    return buildSpec({
        kind,
        resultsRunner: new SqlChartResultsRunner({
            pivotChartData: data,
            originalColumns: Object.fromEntries(
                columns.map((column) => [column.reference, column]),
            ),
        }),
        layout,
        colors,
        limit: rows.length,
    });
};

/** The chart of a node result pivoted on the compose engine: aggregated, split or value-sorted. */
export const buildComposerPivotSpec = async ({
    kind,
    result,
    layout,
    colors,
}: {
    kind: ComposerChartKind;
    result: ComposerPivotResult;
    layout: PivotChartLayout;
    colors: string[];
}): Promise<ComposerChartSpec> =>
    buildSpec({
        kind,
        resultsRunner: new SqlChartResultsRunner(result),
        layout,
        colors,
        limit: result.pivotChartData.results.length,
    });

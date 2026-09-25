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
    type RawResultRow,
    type ResultColumn,
} from '@lightdash/common';
import { SqlChartResultsRunner } from '../../../../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';

type EChartsSpec = Record<string, AnyType>;

export type ComposerChartSpec =
    | { kind: 'echarts'; option: EChartsSpec }
    | { kind: 'big_number'; spec: BigNumberSpec | undefined };

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
    axes: ComposerVizAxes;
    colors: string[];
}): Promise<ComposerChartSpec> => {
    const { data, layout } = buildComposerChartData({ rows, ...axes });
    const resultsRunner = new SqlChartResultsRunner({
        pivotChartData: data,
        originalColumns: Object.fromEntries(
            columns.map((column) => [column.reference, column]),
        ),
    });
    const query = { sql: '', limit: rows.length, sortBy: [], filters: [] };

    const cartesian = async (type: ChartKind.VERTICAL_BAR | ChartKind.LINE) => {
        const model = new CartesianChartDataModel({
            resultsRunner,
            fieldConfig: layout,
            type,
        });
        await model.getPivotedChartData(query);
        return model.getSpec(undefined, colors);
    };

    switch (kind) {
        case 'bar':
            return {
                kind: 'echarts',
                option: await cartesian(ChartKind.VERTICAL_BAR),
            };
        case 'line':
            return { kind: 'echarts', option: await cartesian(ChartKind.LINE) };
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

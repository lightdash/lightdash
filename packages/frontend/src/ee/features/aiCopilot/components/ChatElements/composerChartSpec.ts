import {
    assertUnreachable,
    BigNumberDataModel,
    buildComposerChartData,
    CartesianChartDataModel,
    ChartKind,
    getLegendStyle,
    getTooltipStyle,
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

/** Vertical bar spec with the axes swapped: categories down the side. */
const toHorizontalSpec = (spec: EChartsSpec): EChartsSpec => {
    const [valueAxis] = spec.yAxis as EChartsSpec[];
    return {
        ...spec,
        xAxis: {
            ...valueAxis,
            position: 'bottom',
            nameRotate: 0,
            nameGap: 30,
        },
        yAxis: {
            ...(spec.xAxis as EChartsSpec),
            nameRotate: 90,
            nameGap: 50,
            inverse: true,
        },
        series: (spec.series as EChartsSpec[]).map((series) => ({
            ...series,
            encode: { x: series.encode.y, y: series.encode.x },
            yAxisIndex: undefined,
            // Corner radius was computed for upright bars.
            itemStyle: undefined,
        })),
    };
};

/** Line spec drawn as points over a numeric x axis. */
const toScatterSpec = (spec: EChartsSpec): EChartsSpec => ({
    ...spec,
    xAxis: { ...(spec.xAxis as EChartsSpec), type: 'value' },
    series: (spec.series as EChartsSpec[]).map((series) => ({
        ...series,
        type: 'scatter',
        symbolSize: 10,
        showSymbol: undefined,
    })),
});

/** One funnel stage per row, largest at the top. */
const buildFunnelSpec = ({
    rows,
    x,
    y,
    colors,
}: {
    rows: RawResultRow[];
    x: ResultColumn;
    y: ResultColumn;
    colors: string[];
}): EChartsSpec => ({
    color: colors,
    legend: {
        show: true,
        orient: 'horizontal',
        type: 'scroll',
        left: 'center',
        top: 'top',
        ...getLegendStyle('square'),
    },
    tooltip: { trigger: 'item', ...getTooltipStyle() },
    series: [
        {
            type: 'funnel',
            sort: 'descending',
            gap: 3,
            label: { show: true, position: 'inside' },
            data: rows.map((row) => ({
                name: String(row[x.reference] ?? ''),
                value: Number(row[y.reference]),
            })),
        },
    ],
    textStyle: { fontFamily: 'Inter, sans-serif' },
});

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
        case 'horizontal':
            return {
                kind: 'echarts',
                option: toHorizontalSpec(
                    await cartesian(ChartKind.VERTICAL_BAR),
                ),
            };
        case 'line':
            return { kind: 'echarts', option: await cartesian(ChartKind.LINE) };
        case 'scatter':
            return {
                kind: 'echarts',
                option: toScatterSpec(await cartesian(ChartKind.LINE)),
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
        case 'funnel':
            if (!axes.x) throw new Error('A funnel needs a category column');
            return {
                kind: 'echarts',
                option: buildFunnelSpec({ rows, x: axes.x, y: axes.y, colors }),
            };
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

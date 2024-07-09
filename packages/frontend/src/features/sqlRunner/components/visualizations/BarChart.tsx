import { type SqlRunnerResultsTransformer } from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps } from 'echarts-for-react/lib/types';
import { memo, type FC } from 'react';
import { type BarChartConfig } from '../../store/sqlRunnerSlice';

type BarChartProps = Omit<EChartsReactProps, 'option'> & {
    resultsTransformer: SqlRunnerResultsTransformer;
    config: BarChartConfig;
};

const getEchartsSpec = ({
    transformer,
    config,
}: {
    transformer: SqlRunnerResultsTransformer;
    config: BarChartConfig;
}) => {
    const data = transformer.getRows();
    const columns = transformer.getColumns();
    const { axis, series } = config;

    console.log({
        data,
        columns,
        axis,
        series,
    });

    return {
        title: {
            text: 'Moo',
        },
        tooltip: {},
        xAxis: {
            type: 'category',
            name: axis.x.label,
        },
        yAxis: {
            type: 'value',
            name: axis.y[0].label,
        },
        dataset: {
            id: 'dataset',
            source: data.map((row) => {
                const newRow: {
                    [key: string]: string;
                } = {};
                columns.forEach((column) => {
                    newRow[column] = row[column].value.formatted;
                });
                return newRow;
            }),
        },
        series: series.map((s) => {
            return {
                dimensions: [axis.x.reference, s.reference],
                type: 'bar',
                encode: {
                    seriesName: s.reference,
                    x: axis.x.reference,
                    xRef: { field: axis.x.reference },
                    y: s.reference,
                    yRef: { field: s.reference },
                },
            };
        }),
    };
};

const BarChart: FC<BarChartProps> = memo(
    ({ resultsTransformer, config, className, ...rest }) => {
        return (
            <EChartsReact
                className={className}
                option={getEchartsSpec({
                    transformer: resultsTransformer,
                    config,
                })}
                notMerge
                opts={{
                    renderer: 'svg',
                    width: 'auto',
                    height: 'auto',
                }}
                {...rest}
            />
        );
    },
);

export default BarChart;

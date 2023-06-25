import { NonIdealState, Spinner } from '@blueprintjs/core';
import EChartsReact from 'echarts-for-react';
import { EChartsReactProps, Opts } from 'echarts-for-react/lib/types';
import { FC, memo, useEffect, useMemo } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

// FIXME: duplicate from charts
const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <NonIdealState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon="chart"
        />
    </div>
);

const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <NonIdealState title="Loading chart" icon={<Spinner />} />
    </div>
);

type SimplePieChartProps = Omit<EChartsReactProps, 'option'> & {
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimplePieChart: FC<SimplePieChartProps> = memo((props) => {
    const {
        resultsData,
        chartRef,
        isLoading,
        pieChartConfig: {
            validPieChartConfig: { groupFieldIds, metricId },
        },
    } = useVisualizationContext();

    const data = useMemo(() => {
        if (!groupFieldIds || !metricId) return [];

        return resultsData?.rows.map((row) => ({
            name: groupFieldIds
                .map((fieldId) => row[fieldId].value.formatted)
                .join(' - '),
            value: row[metricId].value.raw,
        }));
    }, [groupFieldIds, metricId, resultsData]);

    const pieChartOptions = {
        tooltip: {
            trigger: 'item',
        },
        legend: {
            orient: 'horizontal',
            left: 'left',
        },
        padding: [10],

        series: [
            {
                name: 'Access From',
                type: 'pie',
                radius: '80%',
                minAngle: 20,
                endAngle: 50,
                label: {
                    show: false,
                    position: 'outside',
                    formatter: '{b}\n {d}%',
                },
                data,
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)',
                    },
                },
            },
        ],
    };

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    if (isLoading) return <LoadingChart />;
    if (!pieChartOptions) return <EmptyChart />;

    return (
        <EChartsReact
            ref={chartRef}
            data-testid={props['data-testid']}
            className={props.className}
            style={
                props.$shouldExpand
                    ? {
                          minHeight: 'inherit',
                          height: '100%',
                          width: '100%',
                      }
                    : {
                          minHeight: 'inherit',
                          // height defaults to 300px
                          width: '100%',
                      }
            }
            opts={EchartOptions}
            option={pieChartOptions}
            notMerge
            {...props}
        />
    );
});

export default SimplePieChart;

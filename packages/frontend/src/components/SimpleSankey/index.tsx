import { Box } from '@mantine/core';
import { IconFilterOff } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, type FC } from 'react';
import useEchartsSankeyConfig from '../../hooks/echarts/useEchartsSankeyConfig';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart = () => (
    <Box h="100%" w="100%" py="xl">
        <SuboptimalState
            title="No data available"
            description="Query at least two dimensions and one metric to create a Sankey chart."
            icon={IconFilterOff}
        />
    </Box>
);

const LoadingChart = () => (
    <Box h="100%" w="100%" py="xl">
        <SuboptimalState
            title="Loading chart"
            loading
            className="loading_chart"
        />
    </Box>
);

type SimpleSankeyProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleSankey: FC<SimpleSankeyProps> = memo((props) => {
    const { chartRef, isLoading, resultsData } = useVisualizationContext();

    const sankeyChartOptions = useEchartsSankeyConfig(props.isInDashboard);

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    if (isLoading) return <LoadingChart />;
    if (!sankeyChartOptions) return <EmptyChart />;

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
            option={sankeyChartOptions}
            notMerge
            {...props}
        />
    );
});

export default SimpleSankey;

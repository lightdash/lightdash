import { MapChartType } from '@lightdash/common';
import { IconMap } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useEffect, type FC } from 'react';
import useEchartsMapConfig from '../../hooks/echarts/useEchartsMapConfig';
import EChartsReact from '../EChartsReactWrapper';
import { isMapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart: FC<{ locationType?: MapChartType }> = ({ locationType }) => {
    const description =
        locationType === MapChartType.AREA
            ? 'Query metrics and dimensions with region data.'
            : 'Query metrics and dimensions with latitude/longitude data.';

    return (
        <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
            <SuboptimalState
                title="No data available"
                description={description}
                icon={IconMap}
            />
        </div>
    );
};

const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="Loading chart"
            loading
            className="loading_chart"
        />
    </div>
);

type SimpleMapProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleMap: FC<SimpleMapProps> = memo((props) => {
    const { chartRef, isLoading, visualizationConfig, resultsData } =
        useVisualizationContext();
    const mapOptions = useEchartsMapConfig({
        isInDashboard: props.isInDashboard,
    });

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    console.log(
        'SimpleMap render - isLoading:',
        isLoading,
        'mapOptions:',
        !!mapOptions,
    );

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => {
            window.removeEventListener('resize', listener);
        };
    });

    // Get location type from visualization config
    const locationType = isMapVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.validConfig.locationType
        : undefined;

    if (isLoading) {
        console.log('Showing LoadingChart');
        return <LoadingChart />;
    }
    if (!mapOptions) {
        console.log('Showing EmptyChart - no mapOptions');
        return <EmptyChart locationType={locationType} />;
    }

    console.log('Rendering ECharts map');

    return (
        <>
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
                              height: '400px',
                              width: '100%',
                          }
                }
                opts={EchartOptions}
                option={mapOptions.eChartsOption}
                notMerge
                {...props}
            />
        </>
    );
});

export default SimpleMap;

import { IconGauge } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import clamp from 'lodash/clamp';
import { memo, useEffect, useMemo, useState, type FC } from 'react';
import useEchartsGaugeConfig from '../../hooks/echarts/useEchartsGaugeConfig';
import { DEFAULT_ROW_HEIGHT } from '../DashboardTabs/gridUtils';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconGauge}
        />
    </div>
);

const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="Loading chart"
            loading
            className="loading_chart"
        />
    </div>
);

type SimpleGaugeProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const BOX_MIN_WIDTH = 150;
const BOX_MAX_WIDTH = 1000;

const BOX_MIN_HEIGHT = DEFAULT_ROW_HEIGHT;
const BOX_MAX_HEIGHT = 1000;

const LINE_SIZE_MIN = 15;
const LINE_SIZE_MAX = 150;

const DETAILS_SIZE_MIN = 10;
const DETAILS_SIZE_MAX = 160;

const TITLE_SIZE_MIN = 5;
const TITLE_SIZE_MAX = 50;

const calculateFontSize = (
    fontSizeMin: number,
    fontSizeMax: number,
    boundWidth: number,
    boundHeight: number,
) => {
    const widthScale =
        (boundWidth - BOX_MIN_WIDTH) / (BOX_MAX_WIDTH - BOX_MIN_WIDTH);
    const heightScale =
        (boundHeight - BOX_MIN_HEIGHT) / (BOX_MAX_HEIGHT - BOX_MIN_HEIGHT);

    const scalingFactor = Math.min(widthScale, heightScale);

    // assert : 0 <= scalingFactor <= 1
    const fontSize = Math.floor(
        fontSizeMin + (fontSizeMax - fontSizeMin) * scalingFactor,
    );

    return fontSize;
};

const calculateRadius = (boundWidth: number, boundHeight: number) => {
    const aspectRatio = boundWidth / boundHeight;
    const baseRadius = 90;

    if (aspectRatio === 1) {
        return baseRadius;
    }

    if (aspectRatio > 1) {
        return baseRadius * Math.min(aspectRatio, 1.5);
    }

    return baseRadius;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleGauge: FC<SimpleGaugeProps> = memo((props) => {
    const { chartRef, isLoading } = useVisualizationContext();
    const [chartWidth, setChartWidth] = useState(0);
    const [chartHeight, setChartHeight] = useState(0);
    const sizes = useMemo(() => {
        const boundWidth = clamp(chartWidth || 0, BOX_MIN_WIDTH, BOX_MAX_WIDTH);

        const availableHeightForFontSizeCalculation = chartHeight ?? 0;

        const boundHeight = clamp(
            availableHeightForFontSizeCalculation,
            BOX_MIN_HEIGHT,
            BOX_MAX_HEIGHT,
        );

        return {
            tileFontSize: calculateFontSize(
                TITLE_SIZE_MIN,
                TITLE_SIZE_MAX,
                boundWidth,
                boundHeight,
            ),
            detailsFontSize: calculateFontSize(
                DETAILS_SIZE_MIN,
                DETAILS_SIZE_MAX,
                boundWidth,
                boundHeight,
            ),
            lineSize: calculateFontSize(
                LINE_SIZE_MIN,
                LINE_SIZE_MAX,
                boundWidth,
                boundHeight,
            ),
            radius: calculateRadius(boundWidth, boundHeight),
        };
    }, [chartWidth, chartHeight]);
    const gaugeOptions = useEchartsGaugeConfig({
        isInDashboard: props.isInDashboard,
        ...sizes,
    });

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setChartWidth(width);
            setChartHeight(height);
        });

        if (chartRef.current?.getEchartsInstance().getDom()) {
            observer.observe(chartRef.current?.getEchartsInstance().getDom());
        }
        window.addEventListener('resize', listener);
        return () => {
            window.removeEventListener('resize', listener);
            observer.disconnect();
        };
    });

    if (isLoading) return <LoadingChart />;
    if (!gaugeOptions) return <EmptyChart />;

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
                              // height defaults to 300px
                              width: '100%',
                          }
                }
                opts={EchartOptions}
                option={gaugeOptions.eChartsOption}
                notMerge
                {...props}
            />
        </>
    );
});

export default SimpleGauge;

import { NonIdealState, Spinner } from '@blueprintjs/core';
import { ResultValue } from '@lightdash/common';
import { useDisclosure } from '@mantine/hooks';
import { ECElementEvent } from 'echarts';
import EChartsReact from 'echarts-for-react';
import { EChartsReactProps, Opts } from 'echarts-for-react/lib/types';
import { FC, memo, useCallback, useEffect, useState } from 'react';
import useEchartsPieConfig, {
    PieSeriesDataPoint,
} from '../../hooks/echarts/useEchartsPieChart';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import PieChartContextMenu, {
    PieChartContextMenuProps,
} from './PieChartContextMenu';

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
    const { chartRef, isLoading } = useVisualizationContext();
    const pieChartOptions = useEchartsPieConfig();
    const [isOpen, { open, close }] = useDisclosure();
    const [menuProps, setMenuProps] = useState<{
        position: PieChartContextMenuProps['menuPosition'];
        value: ResultValue;
    }>();

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    const handleOpenContextMenu = useCallback(
        (e: ECElementEvent) => {
            const event = e.event?.event as unknown as PointerEvent;
            const data = e.data as PieSeriesDataPoint;

            setMenuProps({
                value: data.meta.value,
                position: {
                    left: event.clientX,
                    top: event.clientY,
                },
            });

            open();
        },
        [open],
    );

    const handleCloseContextMenu = useCallback(() => {
        setMenuProps(undefined);
        close();
    }, [close]);

    if (isLoading) return <LoadingChart />;
    if (!pieChartOptions) return <EmptyChart />;

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
                option={pieChartOptions.eChartsOption}
                notMerge
                {...props}
                onEvents={{
                    click: handleOpenContextMenu,
                    oncontextmenu: handleOpenContextMenu,
                }}
            />

            <PieChartContextMenu
                value={menuProps?.value}
                menuPosition={menuProps?.position}
                opened={isOpen}
                onClose={handleCloseContextMenu}
            />
        </>
    );
});

export default SimplePieChart;

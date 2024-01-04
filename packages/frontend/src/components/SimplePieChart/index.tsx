import { useDisclosure } from '@mantine/hooks';
import { IconChartPieOff } from '@tabler/icons-react';
import { ECElementEvent } from 'echarts';
import EChartsReact from 'echarts-for-react';
import { EChartsReactProps, Opts } from 'echarts-for-react/lib/types';
import { FC, memo, useCallback, useEffect, useState } from 'react';
import useEchartsPieConfig, {
    PieSeriesDataPoint,
} from '../../hooks/echarts/useEchartsPieConfig';
import { useApp } from '../../providers/AppProvider';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import PieChartContextMenu, {
    PieChartContextMenuProps,
} from './PieChartContextMenu';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconChartPieOff}
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

type SimplePieChartProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimplePieChart: FC<SimplePieChartProps> = memo((props) => {
    const { chartRef, isLoading } = useVisualizationContext();

    const pieChartOptions = useEchartsPieConfig(props.isInDashboard);
    const { user } = useApp();

    const [isOpen, { open, close }] = useDisclosure();
    const [menuProps, setMenuProps] = useState<{
        position: PieChartContextMenuProps['menuPosition'];
        value: PieChartContextMenuProps['value'];
        rows: PieChartContextMenuProps['rows'];
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
                rows: data.meta.rows,
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

            {user.data && (
                <PieChartContextMenu
                    value={menuProps?.value}
                    menuPosition={menuProps?.position}
                    rows={menuProps?.rows}
                    opened={isOpen}
                    onClose={handleCloseContextMenu}
                />
            )}
        </>
    );
});

export default SimplePieChart;

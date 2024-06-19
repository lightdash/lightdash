import { useDisclosure } from '@mantine/hooks';
import { IconFilterOff } from '@tabler/icons-react';
import { type ECElementEvent } from 'echarts';
import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useCallback, useEffect, useState, type FC } from 'react';
import useEchartsFunnelConfig, {
    type FunnelSeriesDataPoint,
} from '../../hooks/echarts/useEchartsFunnelConfig';
import { useApp } from '../../providers/AppProvider';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import FunnelChartContextMenu, {
    type FunnelChartContextMenuProps,
} from './FunnelChartContextMenu';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconFilterOff}
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

type FunnelChartProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const FunnelChart: FC<FunnelChartProps> = memo((props) => {
    const { chartRef, isLoading } = useVisualizationContext();

    const funnelChartOptions = useEchartsFunnelConfig(props.isInDashboard);
    const { user } = useApp();

    const [isOpen, { open, close }] = useDisclosure();

    const [menuProps, setMenuProps] = useState<{
        position: FunnelChartContextMenuProps['menuPosition'];
        value: FunnelChartContextMenuProps['value'];
        rows: FunnelChartContextMenuProps['rows'];
    }>();

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    const handleOpenContextMenu = useCallback(
        (e: ECElementEvent) => {
            const event = e.event?.event as unknown as PointerEvent;
            const data = e.data as FunnelSeriesDataPoint;

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
    if (!funnelChartOptions) return <EmptyChart />;

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
                option={funnelChartOptions}
                notMerge
                {...props}
                onEvents={{
                    click: handleOpenContextMenu,
                    oncontextmenu: handleOpenContextMenu,
                }}
            />

            {user.data && (
                <FunnelChartContextMenu
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

export default FunnelChart;

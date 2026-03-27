import { type ResultValue } from '@lightdash/common';
import { IconChartTreemap } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { type ECElementEvent } from 'echarts';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useCallback, useEffect, useRef, useState, type FC } from 'react';
import useEchartsTreemapConfig from '../../hooks/echarts/useEchartsTreemapConfig';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { type TreemapNode } from '../../hooks/useTreemapChartConfig';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import TreemapContextMenu, {
    type TreemapContextMenuProps,
} from './TreemapContextMenu';

const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconChartTreemap}
        />
    </div>
);

type SimpleTreemapProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimpleTreemap: FC<SimpleTreemapProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const { chartRef, isLoading, resultsData, minimal } =
            useVisualizationContext();

        const treemapOptions = useEchartsTreemapConfig(props.isInDashboard);
        const { shouldShowMenu, canViewUnderlyingData } =
            useContextMenuPermissions({ minimal });

        const [isOpen, { open, close }] = useDisclosure();

        const [menuProps, setMenuProps] = useState<{
            position: TreemapContextMenuProps['menuPosition'];
            value: TreemapContextMenuProps['value'];
            fieldValues: TreemapContextMenuProps['fieldValues'];
        }>();

        const hasSignaledScreenshotReady = useRef(false);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current) return;
            if (!onScreenshotReady && !onScreenshotError) return;

            if (!isLoading) {
                onScreenshotReady?.();
                hasSignaledScreenshotReady.current = true;
            }
        }, [isLoading, treemapOptions, onScreenshotReady, onScreenshotError]);

        useEffect(() => {
            resultsData?.setFetchAll(true);
        }, [resultsData]);

        useEffect(() => {
            const listener = () =>
                chartRef.current?.getEchartsInstance().resize();
            window.addEventListener('resize', listener);
            return () => window.removeEventListener('resize', listener);
        });

        const handleOpenContextMenu = useCallback(
            (e: ECElementEvent) => {
                const event = e.event?.event as unknown as PointerEvent;
                const data = e.data as TreemapNode | undefined;

                if (!data?.meta) return;

                // Build a ResultValue from the node name (the formatted dimension value)
                const nodeValue: ResultValue = {
                    raw: data.name,
                    formatted: data.name,
                };

                setMenuProps({
                    value: nodeValue,
                    position: {
                        left: event.pageX,
                        top: event.pageY,
                    },
                    fieldValues: data.meta.fieldValues,
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
        if (!treemapOptions) return <EmptyChart />;

        return (
            <>
                <EChartsReact
                    ref={chartRef}
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
                    option={treemapOptions.eChartsOption}
                    notMerge
                    {...props}
                    onEvents={{
                        click: handleOpenContextMenu,
                        oncontextmenu: handleOpenContextMenu,
                    }}
                />

                {shouldShowMenu && (
                    <TreemapContextMenu
                        value={menuProps?.value}
                        menuPosition={menuProps?.position}
                        fieldValues={menuProps?.fieldValues}
                        opened={isOpen}
                        onClose={handleCloseContextMenu}
                        canViewUnderlyingData={canViewUnderlyingData}
                    />
                )}
            </>
        );
    },
);

export default SimpleTreemap;

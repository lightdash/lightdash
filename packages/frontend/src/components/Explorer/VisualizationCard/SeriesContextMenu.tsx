import { Menu, Portal } from '@blueprintjs/core';
import {
    MenuItem2,
    Popover2,
    Popover2TargetProps,
} from '@blueprintjs/popover2';
import { getItemMap } from '@lightdash/common';
import { FC, memo, useCallback, useEffect, useState } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import {
    getDataFromChartClick,
    useUnderlyingDataContext,
} from '../../UnderlyingData/UnderlyingDataProvider';

export const SeriesContextMenu: FC<{
    echartSeriesClickEvent: EchartSeriesClickEvent | undefined;
    dimensions: string[] | undefined;
    pivot: string | undefined;
    series: EChartSeries[] | undefined;
}> = memo(({ echartSeriesClickEvent, dimensions, pivot, series }) => {
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const { data: explore } = useExplore(tableName);
    const context = useVisualizationContext();
    const { resultsData: { metricQuery } = {} } = context;

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const { viewData } = useUnderlyingDataContext();

    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();

    useEffect(() => {
        if (echartSeriesClickEvent !== undefined) {
            const e: EchartSeriesClickEvent = echartSeriesClickEvent;

            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });
        }
    }, [echartSeriesClickEvent]);

    const viewUnderlyingData = useCallback(() => {
        if (explore !== undefined && echartSeriesClickEvent !== undefined) {
            const allItemsMap = getItemMap(
                explore,
                metricQuery?.additionalMetrics,
                metricQuery?.tableCalculations,
            );

            const underlyingData = getDataFromChartClick(
                echartSeriesClickEvent,
                pivot,
                allItemsMap,
                series || [],
            );

            viewData(
                underlyingData.value,
                underlyingData.meta,
                underlyingData.row,
                dimensions,
                underlyingData.pivot,
            );
        }
    }, [
        explore,
        echartSeriesClickEvent,
        metricQuery,
        pivot,
        series,
        viewData,
        dimensions,
    ]);
    const contextMenuRenderTarget = useCallback(
        ({ ref }: Popover2TargetProps) => (
            <Portal>
                <div
                    style={{ position: 'absolute', ...contextMenuTargetOffset }}
                    ref={ref}
                />
            </Portal>
        ),
        [contextMenuTargetOffset],
    );

    const cancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const onViewUnderlyingData = useCallback(
        (e) => {
            viewUnderlyingData();
        },
        [viewUnderlyingData],
    );

    const onClose = useCallback(() => setContextMenuIsOpen(false), []);

    return (
        <Popover2
            content={
                <div onContextMenu={cancelContextMenu}>
                    <Menu>
                        <MenuItem2
                            text={`View underlying data`}
                            icon={'layers'}
                            onClick={onViewUnderlyingData}
                        />
                    </Menu>
                </div>
            }
            enforceFocus={false}
            hasBackdrop={true}
            isOpen={contextMenuIsOpen}
            minimal={true}
            onClose={onClose}
            placement="right-start"
            positioningStrategy="fixed"
            rootBoundary={'viewport'}
            renderTarget={contextMenuRenderTarget}
            transitionDuration={100}
        />
    );
});

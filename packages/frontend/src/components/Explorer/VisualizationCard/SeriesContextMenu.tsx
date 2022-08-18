import { Menu, MenuItem, Portal } from '@blueprintjs/core';
import { Popover2, Popover2TargetProps } from '@blueprintjs/popover2';
import { FC, useCallback, useEffect, useState } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import {
    getDataFromChartClick,
    useUnderlyingDataContext,
} from '../../UnderlyingData/UnderlyingDataProvider';

export const SeriesContextMenu: FC<{
    echartSeriesClickEvent: EchartSeriesClickEvent | undefined;
    dimensions: string[];
    pivot: string | undefined;
    series: EChartSeries[];
}> = ({ echartSeriesClickEvent, dimensions, pivot, series }) => {
    const {
        state: { unsavedChartVersion },
    } = useExplorer();
    const { data: explore } = useExplore(unsavedChartVersion.tableName);

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
            const underlyingData = getDataFromChartClick(
                echartSeriesClickEvent,
                pivot,
                explore,
                series,
            );

            viewData(
                underlyingData.value,
                underlyingData.meta,
                underlyingData.row,
                dimensions,
                underlyingData.pivot,
            );
        }
    }, [explore, echartSeriesClickEvent, viewData, pivot, dimensions, series]);
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

    return (
        <Popover2
            content={
                <div onContextMenu={cancelContextMenu}>
                    <Menu>
                        <MenuItem
                            text={`View underlying data`}
                            icon={'layers'}
                            onClick={(e) => {
                                viewUnderlyingData();
                            }}
                        />
                    </Menu>
                </div>
            }
            enforceFocus={false}
            hasBackdrop={true}
            isOpen={contextMenuIsOpen}
            minimal={true}
            onClose={() => setContextMenuIsOpen(false)}
            placement="right-start"
            positioningStrategy="fixed"
            rootBoundary={'viewport'}
            renderTarget={contextMenuRenderTarget}
            transitionDuration={100}
        />
    );
};

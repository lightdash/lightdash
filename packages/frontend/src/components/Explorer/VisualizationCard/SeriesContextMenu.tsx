import { Button, H5, Menu, MenuItem, Portal } from '@blueprintjs/core';
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
import {
    CardHeader,
    CardHeaderTitle,
    MainCard,
} from './VisualizationCard.styles';

export const SeriesContextMenu: FC<{
    echartSeriesClickEvent: EchartSeriesClickEvent | undefined;
    series: EChartSeries[];
    pivot: string | undefined;
}> = ({ echartSeriesClickEvent, series, pivot }) => {
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
            );

            viewData(
                underlyingData.value,
                underlyingData.meta,
                underlyingData.row,
                underlyingData.pivot,
            );
        }
    }, [explore, echartSeriesClickEvent, viewData, pivot]);
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

    if (!unsavedChartVersion.tableName) {
        return (
            <MainCard elevation={1}>
                <CardHeader>
                    <CardHeaderTitle>
                        <Button icon={'chevron-right'} minimal disabled />
                        <H5>Charts</H5>
                    </CardHeaderTitle>
                </CardHeader>
            </MainCard>
        );
    }

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

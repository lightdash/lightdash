import { Button, H5, Menu, MenuItem, Portal } from '@blueprintjs/core';
import { Popover2, Popover2TargetProps } from '@blueprintjs/popover2';
import { fieldId, getDimensions, ResultRow } from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import { TableColumn } from '../../common/Table/types';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';
import {
    CardHeader,
    CardHeaderTitle,
    MainCard,
} from './VisualizationCard.styles';

export const SeriesContextMenu: FC<{
    echartSeriesClickEvent: EchartSeriesClickEvent | undefined;
}> = ({ echartSeriesClickEvent }) => {
    const {
        state: { isEditMode, unsavedChartVersion, expandedSections },
        queryResults,
        actions: {
            setPivotFields,
            setChartType,
            setChartConfig,
            toggleExpandedSection,
        },
    } = useExplorer();
    const { data: explore } = useExplore(unsavedChartVersion.tableName);
    const vizIsOpen = expandedSections.includes(ExplorerSection.VISUALIZATION);

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const { viewData } = useUnderlyingDataContext();

    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();

    const [viewUnderlyingDataOptions, setViewUnderlyingDataOptions] = useState<{
        value: ResultRow[0]['value'];
        meta: TableColumn['meta'];
        row: ResultRow;
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
            const e: EchartSeriesClickEvent = echartSeriesClickEvent;
            const dimensions = getDimensions(explore).filter((dimension) =>
                e.dimensionNames.includes(fieldId(dimension)),
            );
            const selectedDimension = dimensions[0];
            const selectedValue = e.data[fieldId(selectedDimension)];

            const meta = { item: selectedDimension };
            const value = { raw: selectedValue, formatted: selectedValue };
            const row = e.data as ResultRow;
            viewData(value, meta, row);
        }
    }, [explore, echartSeriesClickEvent, viewData]);
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

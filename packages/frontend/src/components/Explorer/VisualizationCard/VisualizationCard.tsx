import {
    Button,
    Collapse,
    H5,
    Menu,
    MenuItem,
    Portal,
} from '@blueprintjs/core';
import { Popover2, Popover2TargetProps } from '@blueprintjs/popover2';
import {
    ChartType,
    fieldId,
    getDimensions,
    ResultRow,
} from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { useExplore } from '../../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import { ChartDownloadMenu } from '../../ChartDownload';
import { TableColumn } from '../../common/Table/types';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import TableConfigPanel from '../../TableConfigPanel';
import { useUnderlyingDataContext } from '../../UnderlyingData/UnderlyingDataProvider';
import VisualizationCardOptions from '../VisualizationCardOptions';
import {
    CardHeader,
    CardHeaderButtons,
    CardHeaderTitle,
    MainCard,
    VisualizationCardContentWrapper,
} from './VisualizationCard.styles';

const ConfigPanel: FC<{ chartType: ChartType }> = ({ chartType }) => {
    switch (chartType) {
        case ChartType.BIG_NUMBER:
            return <BigNumberConfigPanel />;
        case ChartType.TABLE:
            return <TableConfigPanel />;
        default:
            return <ChartConfigPanel />;
    }
};
const VisualizationCard: FC = () => {
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
    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
            if (explore) {
                const dimensions = getDimensions(explore).filter((dimension) =>
                    e.dimensionNames.includes(fieldId(dimension)),
                );
                const selectedDimension = dimensions[0];
                const selectedValue = e.data[fieldId(selectedDimension)];

                setViewUnderlyingDataOptions({
                    meta: { item: selectedDimension },
                    value: { raw: selectedValue, formatted: selectedValue },
                    row: e.data as ResultRow,
                });
                setContextMenuIsOpen(true);
                setContextMenuTargetOffset({
                    left: e.event.event.pageX,
                    top: e.event.event.pageY,
                });
            }
        },
        [explore],
    );
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
        <MainCard elevation={1}>
            <VisualizationProvider
                initialChartConfig={unsavedChartVersion.chartConfig}
                chartType={unsavedChartVersion.chartConfig.type}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                explore={explore}
                resultsData={queryResults.data}
                isLoading={queryResults.isLoading}
                onChartConfigChange={setChartConfig}
                onChartTypeChange={setChartType}
                onPivotDimensionsChange={setPivotFields}
                columnOrder={unsavedChartVersion.tableConfig.columnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
            >
                <CardHeader>
                    <CardHeaderTitle>
                        <Button
                            icon={vizIsOpen ? 'chevron-down' : 'chevron-right'}
                            minimal
                            onClick={() =>
                                toggleExpandedSection(
                                    ExplorerSection.VISUALIZATION,
                                )
                            }
                        />
                        <H5>Charts</H5>
                    </CardHeaderTitle>
                    {vizIsOpen && (
                        <CardHeaderButtons>
                            {isEditMode && (
                                <>
                                    <VisualizationCardOptions />
                                    <ConfigPanel
                                        chartType={
                                            unsavedChartVersion.chartConfig.type
                                        }
                                    />
                                </>
                            )}
                            <ChartDownloadMenu />
                        </CardHeaderButtons>
                    )}
                </CardHeader>
                <Collapse className="explorer-chart" isOpen={vizIsOpen}>
                    <VisualizationCardContentWrapper className="cohere-block">
                        <LightdashVisualization />

                        <Popover2
                            content={
                                <div onContextMenu={cancelContextMenu}>
                                    <Menu>
                                        <MenuItem
                                            text={`View underlying data`}
                                            icon={'layers'}
                                            onClick={(e) => {
                                                if (
                                                    viewUnderlyingDataOptions !==
                                                    undefined
                                                ) {
                                                    const { value, meta, row } =
                                                        viewUnderlyingDataOptions;
                                                    viewData(value, meta, row);
                                                }
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
                    </VisualizationCardContentWrapper>
                </Collapse>
            </VisualizationProvider>
        </MainCard>
    );
};

export default VisualizationCard;

import { Button, Collapse, H5 } from '@blueprintjs/core';
import { ChartType } from '@lightdash/common';
import { FC, memo, useCallback, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { useExplore } from '../../../hooks/useExplore';
import { Context, ExplorerSection } from '../../../providers/ExplorerProvider';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import { ChartDownloadMenu } from '../../ChartDownload';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import TableConfigPanel from '../../TableConfigPanel';
import VisualizationCardOptions from '../VisualizationCardOptions';
import { SeriesContextMenu } from './SeriesContextMenu';
import ShowTotalsToggle from './ShowTotalsToggle';
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
const VisualizationCard: FC = memo(() => {
    const expandedSections = useContextSelector(
        Context,
        (context) => context!.state.expandedSections,
    );
    const unsavedChartVersion = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion,
    );
    const isEditMode = useContextSelector(
        Context,
        (context) => context!.state.isEditMode,
    );
    const queryResults = useContextSelector(
        Context,
        (context) => context!.queryResults,
    );
    const setPivotFields = useContextSelector(
        Context,
        (context) => context!.actions.setPivotFields,
    );
    const setChartType = useContextSelector(
        Context,
        (context) => context!.actions.setChartType,
    );
    const setChartConfig = useContextSelector(
        Context,
        (context) => context!.actions.setChartConfig,
    );
    const toggleExpandedSection = useContextSelector(
        Context,
        (context) => context!.actions.toggleExpandedSection,
    );

    const { data: explore } = useExplore(unsavedChartVersion.tableName);
    const vizIsOpen = expandedSections.includes(ExplorerSection.VISUALIZATION);

    const [echartsClickEvent, setEchartsClickEvent] = useState<{
        event: EchartSeriesClickEvent;
        dimensions: string[];
        pivot: string | undefined;
        series: EChartSeries[];
    }>();

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
            const pivot = unsavedChartVersion?.pivotConfig?.columns?.[0];

            setEchartsClickEvent({
                event: e,
                dimensions: unsavedChartVersion.metricQuery.dimensions,
                pivot,
                series,
            });
        },
        [unsavedChartVersion],
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
                            {!isEditMode &&
                                unsavedChartVersion.chartConfig.type ===
                                    'table' && <ShowTotalsToggle />}
                            <ChartDownloadMenu />
                        </CardHeaderButtons>
                    )}
                </CardHeader>
                <Collapse className="explorer-chart" isOpen={vizIsOpen}>
                    <VisualizationCardContentWrapper className="cohere-block">
                        <LightdashVisualization />

                        <SeriesContextMenu
                            echartSeriesClickEvent={echartsClickEvent?.event}
                            dimensions={echartsClickEvent?.dimensions || []}
                            pivot={echartsClickEvent?.pivot}
                            series={echartsClickEvent?.series || []}
                        />
                    </VisualizationCardContentWrapper>
                </Collapse>
            </VisualizationProvider>
        </MainCard>
    );
});

export default VisualizationCard;

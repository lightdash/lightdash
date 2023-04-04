import { NotFoundError } from '@lightdash/common';
import { FC, memo, useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { downloadCsv } from '../../../hooks/useDownloadCsv';
import { useExplore } from '../../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { ChartDownloadMenu } from '../../ChartDownload';
import CollapsableCard from '../../common/CollapsableCard';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import VisualizationCardOptions from '../VisualizationCardOptions';
import { SeriesContextMenu } from './SeriesContextMenu';
import ShowTotalsToggle from './ShowTotalsToggle';
import VisualizationConfigPanel from './VisualizationConfigPanel';

export type EchartsClickEvent = {
    event: EchartSeriesClickEvent;
    dimensions: string[];
    series: EChartSeries[];
};

const VisualizationCard: FC<{ projectUuid?: string }> = memo(
    ({ projectUuid: fallBackUUid }) => {
        const unsavedChartVersion = useExplorerContext(
            (context) => context.state.unsavedChartVersion,
        );
        const isLoadingQueryResults = useExplorerContext(
            (context) => context.queryResults.isLoading,
        );
        const queryResults = useExplorerContext(
            (context) => context.queryResults.data,
        );
        const setPivotFields = useExplorerContext(
            (context) => context.actions.setPivotFields,
        );
        const setChartType = useExplorerContext(
            (context) => context.actions.setChartType,
        );
        const setChartConfig = useExplorerContext(
            (context) => context.actions.setChartConfig,
        );
        const expandedSections = useExplorerContext(
            (context) => context.state.expandedSections,
        );
        const isEditMode = useExplorerContext(
            (context) => context.state.isEditMode,
        );
        const toggleExpandedSection = useExplorerContext(
            (context) => context.actions.toggleExpandedSection,
        );
        const chartType = useExplorerContext(
            (context) => context.state.unsavedChartVersion.chartConfig.type,
        );
        const isOpen = useMemo(
            () => expandedSections.includes(ExplorerSection.VISUALIZATION),
            [expandedSections],
        );
        const toggleSection = useCallback(
            () => toggleExpandedSection(ExplorerSection.VISUALIZATION),
            [toggleExpandedSection],
        );
        const projectUuid = useExplorerContext(
            (context) => context.state.savedChart?.projectUuid || fallBackUUid,
        );

        const { data: explore } = useExplore(unsavedChartVersion.tableName);

        const [echartsClickEvent, setEchartsClickEvent] =
            useState<EchartsClickEvent>();

        const onSeriesContextMenu = useCallback(
            (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
                setEchartsClickEvent({
                    event: e,
                    dimensions: unsavedChartVersion.metricQuery.dimensions,
                    series,
                });
            },
            [unsavedChartVersion],
        );

        if (!unsavedChartVersion.tableName) {
            return <CollapsableCard title="Charts" disabled />;
        }

        const getCsvLink = async (
            csvLimit: number | null,
            onlyRaw: boolean,
            showTableNames: boolean,
            columnOrder: string[],
            customLabels?: Record<string, string>,
        ) => {
            if (
                explore?.name &&
                unsavedChartVersion?.metricQuery &&
                projectUuid
            ) {
                const csvResponse = await downloadCsv({
                    projectUuid,
                    tableId: explore?.name,
                    query: unsavedChartVersion?.metricQuery,
                    csvLimit,
                    onlyRaw,
                    showTableNames,
                    columnOrder,
                    customLabels,
                });
                return csvResponse;
            }
            throw new NotFoundError('no metric query defined');
        };

        return (
            <VisualizationProvider
                initialChartConfig={unsavedChartVersion.chartConfig}
                chartType={unsavedChartVersion.chartConfig.type}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                explore={explore}
                resultsData={queryResults}
                isLoading={isLoadingQueryResults}
                onChartConfigChange={setChartConfig}
                onChartTypeChange={setChartType}
                onPivotDimensionsChange={setPivotFields}
                columnOrder={unsavedChartVersion.tableConfig.columnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
            >
                <CollapsableCard
                    title="Charts"
                    isOpen={isOpen}
                    shouldExpand
                    onToggle={toggleSection}
                    rightHeaderElement={
                        isOpen && (
                            <>
                                {isEditMode && (
                                    <>
                                        <VisualizationCardOptions />
                                        <VisualizationConfigPanel
                                            chartType={chartType}
                                        />
                                    </>
                                )}
                                {!isEditMode && chartType === 'table' && (
                                    <ShowTotalsToggle />
                                )}
                                <ChartDownloadMenu
                                    getCsvLink={getCsvLink}
                                    projectUuid={projectUuid!}
                                />
                            </>
                        )
                    }
                >
                    <LightdashVisualization
                        className="sentry-block fs-block cohere-block"
                        data-testid="visualization"
                    />

                    <SeriesContextMenu
                        echartSeriesClickEvent={echartsClickEvent?.event}
                        dimensions={echartsClickEvent?.dimensions}
                        series={echartsClickEvent?.series}
                    />
                </CollapsableCard>
            </VisualizationProvider>
        );
    },
);

export default VisualizationCard;

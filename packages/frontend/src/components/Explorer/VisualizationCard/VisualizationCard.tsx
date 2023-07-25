import { NotFoundError, ResultRow } from '@lightdash/common';
import { FC, memo, useCallback, useMemo, useState } from 'react';

import { Space } from '@mantine/core';
import { PieSeriesOption } from 'echarts';
import { mapValues } from 'lodash-es';
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

export type EchartsPieClickEvent = {
    position: { left: number; top: number };
    dimensions: string[];
    series: PieSeriesOption;
    rows: ResultRow[];
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

        const [echartsCartesianClickEvent, setEchartsCartesianClickEvent] =
            useState<EchartsClickEvent>();

        const [echartsPieClickEvent, setEchartsPieClickEvent] =
            useState<EchartsPieClickEvent>();

        const handleCartesianSeriesContextMenu = useCallback(
            (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
                setEchartsCartesianClickEvent({
                    event: e,
                    dimensions: unsavedChartVersion.metricQuery.dimensions,
                    series,
                });
            },
            [unsavedChartVersion],
        );

        const handlePieSeriesContextMenu = useCallback(
            (
                event: PointerEvent,
                series: PieSeriesOption,
                dimensions: string[],
                rows: ResultRow[],
            ) => {
                setEchartsPieClickEvent({
                    position: { left: event.clientX, top: event.clientY },
                    dimensions,
                    series,
                    rows,
                });
            },
            [],
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
                onCartesianSeriesContextMenu={handleCartesianSeriesContextMenu}
                onPieSeriesContextMenu={handlePieSeriesContextMenu}
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
                    <Space h="sm" />

                    <LightdashVisualization
                        className="sentry-block fs-block cohere-block"
                        data-testid="visualization"
                    />

                    {echartsCartesianClickEvent ? (
                        <SeriesContextMenu
                            type="cartesian"
                            menuPosition={{
                                left: echartsCartesianClickEvent.event.event
                                    .event.clientX,
                                top: echartsCartesianClickEvent.event.event
                                    .event.clientY,
                            }}
                            dimensions={echartsCartesianClickEvent.dimensions}
                            cartesianSeries={echartsCartesianClickEvent.series}
                            seriesIndex={
                                echartsCartesianClickEvent.event.seriesIndex
                            }
                            dimensionNames={
                                echartsCartesianClickEvent.event.dimensionNames
                            }
                            data={echartsCartesianClickEvent.event.data}
                            onClose={() =>
                                setEchartsCartesianClickEvent(undefined)
                            }
                        />
                    ) : null}

                    {echartsPieClickEvent ? (
                        <SeriesContextMenu
                            type="pie"
                            menuPosition={echartsPieClickEvent.position}
                            dimensions={echartsPieClickEvent.dimensions}
                            pieSeries={echartsPieClickEvent.series}
                            seriesIndex={0}
                            dimensionNames={echartsPieClickEvent.dimensions}
                            data={mapValues(
                                echartsPieClickEvent.rows[0],
                                (v) => v.value.raw,
                            )}
                            onClose={() => setEchartsPieClickEvent(undefined)}
                        />
                    ) : null}
                </CollapsableCard>
            </VisualizationProvider>
        );
    },
);

export default VisualizationCard;

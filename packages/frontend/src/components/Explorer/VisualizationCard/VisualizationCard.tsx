import { NotFoundError } from '@lightdash/common';
import { FC, memo, useCallback, useMemo, useState } from 'react';

import { Space } from '@mantine/core';
import { downloadCsv } from '../../../api/csv';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useExplore } from '../../../hooks/useExplore';
import { useApp } from '../../../providers/AppProvider';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import { ChartDownloadMenu } from '../../ChartDownload';
import CollapsableCard from '../../common/CollapsableCard';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import { SeriesContextMenu } from './SeriesContextMenu';
import VisualizationSidebar from './VisualizationSidebar';

export type EchartsClickEvent = {
    event: EchartSeriesClickEvent;
    dimensions: string[];
    series: EChartSeries[];
};

const VisualizationCard: FC<{
    projectUuid?: string;
    isProjectPreview?: boolean;
}> = memo(({ projectUuid: fallBackUUid, isProjectPreview }) => {
    const { health } = useApp();

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

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

    const { getIsEditingDashboardChart } = useDashboardStorage();

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
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            let filteredColumns: string[] | undefined;
            let filteredColumnOrder: string[] | undefined;

            if (
                unsavedChartVersion.chartConfig.type === 'table' &&
                unsavedChartVersion.chartConfig.config?.columns
            ) {
                const columnsConfig =
                    unsavedChartVersion.chartConfig.config?.columns;
                filteredColumns =
                    unsavedChartVersion?.metricQuery.dimensions.filter(
                        (column) =>
                            columnsConfig[column]
                                ? columnsConfig[column].visible !== false
                                : true,
                    );
                filteredColumnOrder = columnOrder.filter(
                    (column) => filteredColumns?.indexOf(column) !== -1,
                );
            }

            const csvResponse = await downloadCsv({
                projectUuid,
                tableId: explore?.name,
                query: {
                    ...unsavedChartVersion?.metricQuery,
                    dimensions:
                        filteredColumns && filteredColumns?.length > 0
                            ? filteredColumns
                            : unsavedChartVersion.metricQuery.dimensions,
                    sorts:
                        filteredColumns && filteredColumns?.length > 0
                            ? unsavedChartVersion.metricQuery.sorts.filter(
                                  (sort) =>
                                      filteredColumns?.indexOf(sort.fieldId) !==
                                      -1,
                              )
                            : unsavedChartVersion.metricQuery?.sorts,
                },
                csvLimit,
                onlyRaw,
                showTableNames,
                columnOrder:
                    filteredColumnOrder && filteredColumnOrder.length > 0
                        ? filteredColumnOrder
                        : columnOrder,
                customLabels,
            });
            return csvResponse;
        }
        throw new NotFoundError('no metric query defined');
    };
    const getGsheetLink = async (columnOrder: string[]) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet({
                projectUuid,
                exploreId: explore?.name,
                metricQuery: unsavedChartVersion?.metricQuery,
                columnOrder,
                showTableNames: true,
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            initialChartConfig={unsavedChartVersion.chartConfig}
            chartType={unsavedChartVersion.chartConfig.type}
            initialPivotDimensions={unsavedChartVersion.pivotConfig?.columns}
            explore={explore}
            resultsData={queryResults}
            isLoading={isLoadingQueryResults}
            onChartConfigChange={setChartConfig}
            onChartTypeChange={setChartType}
            onPivotDimensionsChange={setPivotFields}
            columnOrder={unsavedChartVersion.tableConfig.columnOrder}
            onSeriesContextMenu={onSeriesContextMenu}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
        >
            <CollapsableCard
                title="Charts"
                isOpen={isOpen}
                shouldExpand
                onToggle={toggleSection}
                rightHeaderElement={
                    isOpen && (
                        <>
                            {isEditMode ? (
                                <VisualizationSidebar
                                    chartType={chartType}
                                    savedChart={savedChart}
                                    isEditingDashboardChart={getIsEditingDashboardChart()}
                                    isProjectPreview={isProjectPreview}
                                />
                            ) : null}

                            <ChartDownloadMenu
                                getCsvLink={getCsvLink}
                                projectUuid={projectUuid!}
                                getGsheetLink={getGsheetLink}
                            />
                        </>
                    )
                }
            >
                <Space h="sm" />
                <LightdashVisualization
                    className="sentry-block ph-no-capture"
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
});

export default VisualizationCard;

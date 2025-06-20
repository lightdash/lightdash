import {
    ECHARTS_DEFAULT_COLORS,
    getHiddenTableFields,
    getPivotConfig,
    NotFoundError,
} from '@lightdash/common';
import { useDisclosure } from '@mantine/hooks';
import { type FC, memo, useCallback, useMemo, useState } from 'react';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import { type EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplore } from '../../../hooks/useExplore';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import ChartDownloadMenu from '../../common/ChartDownload/ChartDownloadMenu';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { type EchartSeriesClickEvent } from '../../SimpleChart';
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
    const { data: org } = useOrganization();

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const isLoadingQueryResults = useExplorerContext(
        (context) =>
            context.query.isFetching || context.queryResults.isFetchingRows,
    );
    const query = useExplorerContext((context) => context.query);
    const queryResults = useExplorerContext((context) => context.queryResults);

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
        }),
        [query.data, queryResults],
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
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const tableCalculationsMetadata = useExplorerContext(
        (context) => context.state.metadata?.tableCalculations,
    );
    const getDownloadQueryUuid = useExplorerContext(
        (context) => context.actions.getDownloadQueryUuid,
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

    const [isSidebarOpen, { open: openSidebar, close: closeSidebar }] =
        useDisclosure();

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

    const getGsheetLink = async (
        columnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet({
                projectUuid,
                exploreId: explore?.name,
                metricQuery: unsavedChartVersion?.metricQuery,
                columnOrder,
                showTableNames,
                customLabels,
                hiddenFields: getHiddenTableFields(
                    unsavedChartVersion.chartConfig,
                ),
                pivotConfig: getPivotConfig(unsavedChartVersion),
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <ErrorBoundary>
            <VisualizationProvider
                chartConfig={unsavedChartVersion.chartConfig}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                resultsData={resultsData}
                apiErrorDetail={query.error?.error}
                isLoading={isLoadingQueryResults}
                columnOrder={unsavedChartVersion.tableConfig.columnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
                pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
                savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
                onChartConfigChange={setChartConfig}
                onChartTypeChange={setChartType}
                onPivotDimensionsChange={setPivotFields}
                colorPalette={org?.chartColors ?? ECHARTS_DEFAULT_COLORS}
                tableCalculationsMetadata={tableCalculationsMetadata}
            >
                <CollapsableCard
                    title="Chart"
                    isOpen={isOpen}
                    isVisualizationCard
                    onToggle={toggleSection}
                    rightHeaderElement={
                        isOpen && (
                            <>
                                {isEditMode ? (
                                    <VisualizationSidebar
                                        chartType={
                                            unsavedChartVersion.chartConfig.type
                                        }
                                        savedChart={savedChart}
                                        isProjectPreview={isProjectPreview}
                                        isOpen={isSidebarOpen}
                                        onOpen={openSidebar}
                                        onClose={closeSidebar}
                                    />
                                ) : null}
                                {!!projectUuid && (
                                    <ChartDownloadMenu
                                        getDownloadQueryUuid={
                                            getDownloadQueryUuid
                                        }
                                        projectUuid={projectUuid}
                                        chartName={savedChart?.name}
                                        getGsheetLink={getGsheetLink}
                                    />
                                )}
                            </>
                        )
                    }
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                    />
                    <SeriesContextMenu
                        echartSeriesClickEvent={echartsClickEvent?.event}
                        dimensions={echartsClickEvent?.dimensions}
                        series={echartsClickEvent?.series}
                        explore={explore}
                    />
                </CollapsableCard>
            </VisualizationProvider>
        </ErrorBoundary>
    );
});

export default VisualizationCard;

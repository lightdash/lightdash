import {
    ECHARTS_DEFAULT_COLORS,
    getHiddenTableFields,
    NotFoundError,
} from '@lightdash/common';
import { useDisclosure } from '@mantine/hooks';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import { downloadCsv } from '../../../api/csv';
import { type EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useOrganization } from '../../../hooks/organization/useOrganization';
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
    const unsavedChartVersion = useExplorerContext(
        (context) => context.state.unsavedChartVersion,
    );
    const tableCalculationsMetadata = useExplorerContext(
        (context) => context.state.metadata?.tableCalculations,
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

    const getCsvLink = async (
        csvLimit: number | null,
        onlyRaw: boolean,
        showTableNames: boolean,
        columnOrder: string[],
        customLabels?: Record<string, string>,
    ) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const csvResponse = await downloadCsv({
                projectUuid,
                tableId: explore?.name,
                query: unsavedChartVersion.metricQuery,
                csvLimit,
                onlyRaw,
                showTableNames,
                columnOrder: columnOrder,
                customLabels,
                hiddenFields: getHiddenTableFields(
                    unsavedChartVersion.chartConfig,
                ),
            });
            return csvResponse;
        }
        throw new NotFoundError('no metric query defined');
    };
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
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            chartConfig={unsavedChartVersion.chartConfig}
            initialPivotDimensions={unsavedChartVersion.pivotConfig?.columns}
            resultsData={queryResults}
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
                    <>
                        <VisualizationSidebar
                            isConfigurable={isEditMode && isOpen}
                            chartType={unsavedChartVersion.chartConfig.type}
                            savedChart={savedChart}
                            isProjectPreview={isProjectPreview}
                            opened={isOpen && isEditMode && isSidebarOpen}
                            onOpen={openSidebar}
                            onClose={closeSidebar}
                        />
                        {isOpen && (
                            <ChartDownloadMenu
                                getCsvLink={getCsvLink}
                                projectUuid={projectUuid!}
                                getGsheetLink={getGsheetLink}
                            />
                        )}
                    </>
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
                />
            </CollapsableCard>
        </VisualizationProvider>
    );
});

export default VisualizationCard;

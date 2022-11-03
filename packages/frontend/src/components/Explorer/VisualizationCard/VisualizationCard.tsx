import { ChartType } from '@lightdash/common';
import { FC, memo, useCallback, useMemo, useState } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
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

const VisualizationCard: FC = memo(() => {
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

    const isOnlyExpandedCard =
        expandedSections.length === 1 &&
        expandedSections.includes(ExplorerSection.VISUALIZATION);

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
        >
            <CollapsableCard
                title="Charts"
                isOpen={isOpen}
                shouldExpand={isOnlyExpandedCard}
                onToggle={toggleSection}
                headerActions={
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
                        <ChartDownloadMenu />
                    </>
                }
            >
                <LightdashVisualization
                    className="cohere-block"
                    data-testid="visualization-card-body"
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

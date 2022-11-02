import { Button, H5 } from '@blueprintjs/core';
import { FC, memo, useCallback, useState } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { useExplore } from '../../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import { ExploreCard } from '../Explorer.styles';
import { CardHeader, CardHeaderTitle } from './VisualizationCard.styles';
import VisualizationCardBody, {
    EchartsClickEvent,
} from './VisualizationCardBody';
import VisualizationCardHeader from './VisualizationCardHeader';

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
        return (
            <ExploreCard elevation={1}>
                <CardHeader>
                    <CardHeaderTitle>
                        <Button icon={'chevron-right'} minimal disabled />
                        <H5>Charts</H5>
                    </CardHeaderTitle>
                </CardHeader>
            </ExploreCard>
        );
    }

    const isOnlyExpandedCard =
        expandedSections.length === 1 &&
        expandedSections.includes(ExplorerSection.VISUALIZATION);

    return (
        <ExploreCard
            elevation={1}
            $flexGrow={isOnlyExpandedCard ? 1 : undefined}
        >
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
                <VisualizationCardHeader />
                <VisualizationCardBody echartsClickEvent={echartsClickEvent} />
            </VisualizationProvider>
        </ExploreCard>
    );
});

export default VisualizationCard;

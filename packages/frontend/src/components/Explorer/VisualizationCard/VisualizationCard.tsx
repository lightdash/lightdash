import { Button, H5 } from '@blueprintjs/core';
import { FC, memo, useCallback, useState } from 'react';
import { EChartSeries } from '../../../hooks/echarts/useEcharts';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import {
    CardHeader,
    CardHeaderTitle,
    MainCard,
} from './VisualizationCard.styles';
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
    const { data: explore } = useExplore(unsavedChartVersion.tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsClickEvent>();

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
        </MainCard>
    );
});

export default VisualizationCard;

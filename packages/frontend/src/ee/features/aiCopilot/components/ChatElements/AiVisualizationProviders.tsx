import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiAgentChartTypeOption,
    type ApiAiAgentThreadMessageVizQuery,
    type ChartConfig,
    type EChartsSeries,
    type ToolRunQueryArgs,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
} from '@lightdash/common';
import { useMantineColorScheme } from '@mantine-8/core';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { SeriesContextMenu } from '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { DrillDownModal } from '../../../../../components/MetricQueryData/DrillDownModal';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../../../../components/MetricQueryData/UnderlyingDataModal';
import { type EchartsSeriesClickEvent } from '../../../../../components/SimpleChart';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import useHealth from '../../../../../hooks/health/useHealth';
import { useExplore } from '../../../../../hooks/useExplore';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';

type Props = {
    vizQueryData: ApiAiAgentThreadMessageVizQuery;
    queryResults: InfiniteQueryResults;
    chartConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
    selectedChartType: AiAgentChartTypeOption | null;
    onExpandedChartConfigChange?: (config: ChartConfig) => void;
    children: ReactNode;
};

export const AiVisualizationProviders: FC<Props> = ({
    vizQueryData,
    queryResults,
    chartConfig,
    selectedChartType,
    onExpandedChartConfigChange,
    children,
}) => {
    const { data: health } = useHealth();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: resolvedPalette } = useProjectColorPalette(projectUuid);
    const { colorScheme } = useMantineColorScheme();

    const colorPalette = useMemo(() => {
        if (colorScheme === 'dark' && resolvedPalette?.darkColors) {
            return resolvedPalette.darkColors;
        }
        return resolvedPalette?.colors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, resolvedPalette]);

    const { metricQuery, fields, resolvedTimezone } = vizQueryData.query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsSeriesClickEvent | null>(null);
    const [echartsSeries, setEchartsSeries] = useState<EChartsSeries[]>([]);

    const [expandedChartConfig, setExpandedChartConfig] = useState<
        ChartConfig | undefined
    >(undefined);

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery,
            fields,
            resolvedTimezone: resolvedTimezone ?? undefined,
        }),
        [queryResults, metricQuery, fields, resolvedTimezone],
    );

    const webAiChartConfig = useMemo(
        () =>
            getWebAiChartConfig({
                vizConfig: chartConfig,
                metricQuery,
                maxQueryLimit: health?.query.maxLimit,
                fieldsMap: fields,
                overrideChartType: selectedChartType ?? undefined,
            }),
        [
            chartConfig,
            metricQuery,
            health?.query.maxLimit,
            fields,
            selectedChartType,
        ],
    );

    const groupByDimensions: string[] | undefined = useMemo(
        () => getGroupByDimensions(webAiChartConfig),
        [webAiChartConfig],
    );

    const handleChartConfigChange = useCallback(
        (newConfig: ChartConfig) => {
            setExpandedChartConfig(newConfig);
            onExpandedChartConfigChange?.(newConfig);
        },
        [onExpandedChartConfigChange],
    );

    if (!webAiChartConfig.echartsConfig) {
        return null;
    }

    return (
        <MetricQueryDataProvider
            metricQuery={metricQuery}
            tableName={tableName}
            explore={explore}
            queryUuid={vizQueryData.query.queryUuid}
            resolvedTimezone={resolvedTimezone}
        >
            <VisualizationProvider
                key={selectedChartType ?? 'default'}
                resultsData={resultsData}
                chartConfig={
                    expandedChartConfig ?? webAiChartConfig.echartsConfig
                }
                parameters={vizQueryData.query.usedParametersValues}
                columnOrder={[
                    ...metricQuery.dimensions,
                    ...metricQuery.metrics,
                    ...metricQuery.tableCalculations.map((tc) => tc.name),
                ]}
                pivotTableMaxColumnLimit={
                    health?.pivotTable.maxColumnLimit ?? 60
                }
                initialPivotDimensions={groupByDimensions}
                colorPalette={colorPalette}
                isLoading={resultsData.isFetchingRows}
                onSeriesContextMenu={(
                    e: EchartsSeriesClickEvent,
                    series: EChartsSeries[],
                ) => {
                    setEchartsClickEvent(e);
                    setEchartsSeries(series);
                }}
                onChartConfigChange={handleChartConfigChange}
                unsavedMetricQuery={metricQuery}
            >
                {children}
                {webAiChartConfig.echartsConfig.type ===
                    ChartType.CARTESIAN && (
                    <SeriesContextMenu
                        echartsSeriesClickEvent={echartsClickEvent ?? undefined}
                        dimensions={metricQuery.dimensions}
                        series={echartsSeries}
                        explore={explore}
                    />
                )}
                <UnderlyingDataModal />
                <DrillDownModal />
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};

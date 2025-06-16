import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    type AiAgentMessageAssistant,
    type ApiAiAgentThreadMessageVizQuery,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { useMemo, useState, type FC } from 'react';
import { SeriesContextMenu } from '../../../../../components/Explorer/VisualizationCard/SeriesContextMenu';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../../../../../components/MetricQueryData/UnderlyingDataModal';

import { DrillDownModal } from '../../../../../components/MetricQueryData/DrillDownModal';
import { type EchartSeriesClickEvent } from '../../../../../components/SimpleChart';
import { type EChartSeries } from '../../../../../hooks/echarts/useEchartsCartesianConfig';
import useHealth from '../../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../../hooks/organization/useOrganization';
import { useExplore } from '../../../../../hooks/useExplore';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { getChartOptionsFromAiAgentThreadMessageVizQuery } from '../../utils/echarts';
import { getAiAgentChartConfig } from '../../utils/getAiAgentChartConfig';

type Props = ApiAiAgentThreadMessageVizQuery & {
    vizConfig: AiAgentMessageAssistant['vizConfigOutput'];
    results: InfiniteQueryResults;
};

export const AiChartVisualization: FC<Props> = ({
    query,
    results,
    type,
    vizConfig,
}) => {
    const { data: health } = useHealth();
    const { data: organization } = useOrganization();
    const { metricQuery, fields } = query;
    const tableName = metricQuery?.exploreName;
    const { data: explore } = useExplore(tableName);
    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartSeriesClickEvent | null>(null);
    const [echartSeries, setEchartSeries] = useState<EChartSeries[]>([]);

    const resultsData = useMemo(
        () => ({
            ...results,
            metricQuery,
            fields,
        }),
        [results, metricQuery, fields],
    );

    const chartOptions = useMemo(
        () =>
            getChartOptionsFromAiAgentThreadMessageVizQuery({
                config: vizConfig,
                rows: results.rows,
                type,
            }),
        [vizConfig, results.rows, type],
    );

    const chartConfig = useMemo(
        () =>
            getAiAgentChartConfig({
                type: type,
                chartOptions,
                metricQuery,
            }),
        [type, chartOptions, metricQuery],
    );

    return (
        <Box h="100%" mih={400}>
            <MetricQueryDataProvider
                metricQuery={metricQuery}
                tableName={tableName}
                explore={explore}
                queryUuid={query.queryUuid}
            >
                <VisualizationProvider
                    resultsData={resultsData}
                    chartConfig={chartConfig}
                    columnOrder={[
                        ...metricQuery.dimensions,
                        ...metricQuery.metrics,
                    ]}
                    pivotTableMaxColumnLimit={
                        health?.pivotTable.maxColumnLimit ?? 60
                    }
                    initialPivotDimensions={
                        // @ts-expect-error TODO :: fix this using schema
                        vizConfig?.breakdownByDimension
                            ? // @ts-expect-error TODO :: fix this using schema
                              [vizConfig.breakdownByDimension]
                            : undefined
                    }
                    colorPalette={
                        organization?.chartColors ?? ECHARTS_DEFAULT_COLORS
                    }
                    isLoading={resultsData.isFetchingRows}
                    onSeriesContextMenu={(
                        e: EchartSeriesClickEvent,
                        series: EChartSeries[],
                    ) => {
                        setEchartsClickEvent(e);
                        setEchartSeries(series);
                    }}
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="ai-visualization"
                    />
                    {chartConfig.type === ChartType.CARTESIAN && (
                        <SeriesContextMenu
                            echartSeriesClickEvent={
                                echartsClickEvent ?? undefined
                            }
                            dimensions={metricQuery.dimensions}
                            series={echartSeries}
                            explore={explore}
                        />
                    )}
                </VisualizationProvider>
                <UnderlyingDataModal />
                <DrillDownModal />
            </MetricQueryDataProvider>
        </Box>
    );
};

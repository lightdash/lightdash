import {
    ECHARTS_DEFAULT_COLORS,
    getComposerChartStage,
    getComposerRunQueryChart,
    isApiError,
    toComposerResultRows,
    type ApiExecuteSourceQueriesResults,
    type ChartConfig,
    type ComposerCustomChartTypeSlot,
    type ComposerRunQueryChart,
    type ComposerStoredChartVizConfig,
    type DuckdbSourceQuery,
    type ExecuteSourceQueriesRequestParams,
} from '@lightdash/common';
import { Box, Center, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import { useDataAppVizRenderMetadata } from '../../../../../features/chartTypes/hooks/useDataAppVizRender';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import {
    useInfiniteQueryResults,
    type InfiniteQueryResults,
} from '../../../../../hooks/useQueryResults';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';

const DATA_APP_VIZ_RENDER_TARGET = {
    isEmbedded: false,
    savedChartUuid: undefined,
};

/** Runs the series split's chart stage over the stored node result on the compose engine. */
const useChartStageQueryUuid = (
    projectUuid: string,
    stage: DuckdbSourceQuery | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<string, Error>({
        queryKey: ['composerChartStage', projectUuid, stage],
        queryFn: async () => {
            if (!stage) throw new Error('No chart stage');
            const body = {
                queries: [stage],
            } satisfies ExecuteSourceQueriesRequestParams;
            const { queries } =
                await lightdashApi<ApiExecuteSourceQueriesResults>({
                    url: `/projects/${projectUuid}/query-sources/queries`,
                    version: 'v2',
                    method: 'POST',
                    body: JSON.stringify(body),
                }).catch((error: unknown) => {
                    if (!isApiError(error)) throw error;
                    throw new Error(error.error.message);
                });
            const submission = queries[0];
            if (!submission) throw new Error('Chart query was not submitted');
            return submission.queryUuid;
        },
        enabled: stage !== null,
        staleTime: Infinity,
        retry: false,
    });
};

type Props = {
    projectUuid: string;
    /** The presented node's result in this run. */
    nodeQueryUuid: string;
    /** That result, every row fetched; its columns type the chart. */
    nodeResults: InfiniteQueryResults;
    vizConfig: ComposerStoredChartVizConfig;
    metadata: { title: string; description: string };
    headerContent?: ReactNode;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

// A composer node result drawn by the runQuery chart builders, read-only.
export const AiComposerRunQueryVisualization: FC<Props> = ({
    projectUuid,
    nodeQueryUuid,
    nodeResults,
    vizConfig,
    metadata,
    headerContent,
    onScreenshotReady,
    onScreenshotError,
}) => {
    const columns = useMemo(
        () => Object.values(nodeResults.columns ?? {}),
        [nodeResults.columns],
    );
    const { data: palette } = useProjectColorPalette(projectUuid);
    const colorPalette = palette?.colors ?? ECHARTS_DEFAULT_COLORS;

    const customChartType = vizConfig.type === 'custom' ? vizConfig : null;
    const { data: renderMetadata } = useDataAppVizRenderMetadata(
        projectUuid,
        customChartType?.dataAppVizUuid ?? null,
        DATA_APP_VIZ_RENDER_TARGET,
        customChartType?.dataAppVizVersion ?? undefined,
    );
    const slots = useMemo(
        (): ComposerCustomChartTypeSlot[] | null =>
            renderMetadata?.state === 'ready'
                ? renderMetadata.schema.fields
                : null,
        [renderMetadata],
    );

    const chart = useMemo(():
        | { chart: ComposerRunQueryChart; stage: DuckdbSourceQuery | null }
        | Error
        | null => {
        if (columns.length === 0) return null;
        if (customChartType && slots === null) return null;
        try {
            return {
                chart: getComposerRunQueryChart({
                    columns,
                    vizConfig,
                    metadata,
                    customChartTypeSlots: slots ?? [],
                }),
                stage: getComposerChartStage({
                    vizConfig,
                    customChartTypeSlots: slots ?? [],
                    nodeId: 'chart_stage',
                    source: nodeQueryUuid,
                }),
            };
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    }, [columns, customChartType, slots, vizConfig, metadata, nodeQueryUuid]);
    const readyChart = chart instanceof Error ? null : (chart?.chart ?? null);
    const stage = chart instanceof Error ? null : (chart?.stage ?? null);
    // The provider expands pivoted series; fed back so series colors resolve.
    const [expandedChartConfig, setExpandedChartConfig] =
        useState<ChartConfig | null>(null);

    const stageQuery = useChartStageQueryUuid(projectUuid, stage);
    const stageResults = useInfiniteQueryResults(projectUuid, stageQuery.data);
    // Without a split the chart reads the node result, renamed in memory.
    const results = stage ? stageResults : nodeResults;

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    const errorMessage =
        chart instanceof Error
            ? chart.message
            : renderMetadata?.state === 'unavailable'
              ? 'Custom chart type bundle is unavailable'
              : ((stage ? stageQuery.error?.message : undefined) ??
                results.error?.error.message ??
                null);
    useEffect(() => {
        if (errorMessage) onScreenshotError?.();
    }, [errorMessage, onScreenshotError]);

    const resultsData = useMemo(
        () =>
            readyChart
                ? {
                      ...results,
                      rows: stage
                          ? results.rows
                          : toComposerResultRows(readyChart, results.rows),
                      metricQuery: readyChart.metricQuery,
                      fields: readyChart.fields,
                  }
                : null,
        [results, readyChart, stage],
    );

    const body = (() => {
        if (errorMessage) {
            return (
                <Center h="100%">
                    <Text size="sm" c="red">
                        {errorMessage}
                    </Text>
                </Center>
            );
        }
        if (!readyChart || !resultsData || !results.hasFetchedAllRows) {
            return (
                <Center h="100%">
                    <Loader type="dots" />
                </Center>
            );
        }
        const { metricQuery } = readyChart;
        return (
            <MetricQueryDataProvider
                metricQuery={metricQuery}
                tableName={metricQuery.exploreName}
                explore={undefined}
                queryUuid={results.queryUuid}
            >
                <VisualizationProvider
                    hasExplorerStore={false}
                    minimal
                    resultsData={resultsData}
                    chartConfig={expandedChartConfig ?? readyChart.chartConfig}
                    onChartConfigChange={setExpandedChartConfig}
                    columnOrder={[
                        ...metricQuery.dimensions,
                        ...metricQuery.metrics,
                    ]}
                    initialPivotDimensions={
                        readyChart.pivotColumns.length > 0
                            ? readyChart.pivotColumns
                            : undefined
                    }
                    colorPalette={colorPalette}
                    isLoading={results.isFetchingRows}
                    unsavedMetricQuery={metricQuery}
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="ai-composer-runquery-visualization"
                        enableContextMenu={false}
                        onScreenshotReady={onScreenshotReady}
                        onScreenshotError={onScreenshotError}
                    />
                </VisualizationProvider>
            </MetricQueryDataProvider>
        );
    })();

    if (headerContent === undefined) return body;
    return (
        <Stack gap="md" h="100%" mih={0}>
            {headerContent}
            <Box flex={1} mih={0} px="md" pb="md">
                {body}
            </Box>
        </Stack>
    );
};

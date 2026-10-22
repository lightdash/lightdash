import {
    ECHARTS_DEFAULT_COLORS,
    getComposerRunQueryChart,
    isApiError,
    isComposerCustomChartTypeVizConfig,
    QuerySourceType,
    type ApiExecuteSourceQueriesResults,
    type ChartConfig,
    type ComposerRunQueryChart,
    type ComposerRunQueryVizConfig,
    type ExecuteSourceQueriesRequestParams,
    type PivotConfiguration,
} from '@lightdash/common';
import { Center, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FC } from 'react';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import { useDataAppVizRenderMetadata } from '../../../../../features/chartTypes/hooks/useDataAppVizRender';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';

const DATA_APP_VIZ_RENDER_TARGET = {
    isEmbedded: false,
    savedChartUuid: undefined,
};

/** Pivots a stored node result on the compose engine; the runQuery renderer needs pivotDetails for series splits. */
const usePivotedQueryUuid = (
    projectUuid: string,
    queryUuid: string | undefined,
    pivotConfiguration: PivotConfiguration | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<string, Error>({
        queryKey: [
            'composerRunQueryPivot',
            projectUuid,
            queryUuid,
            pivotConfiguration,
        ],
        queryFn: async () => {
            if (!queryUuid || !pivotConfiguration) {
                throw new Error('Nothing to pivot');
            }
            const body = {
                queries: [
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'viz_pivot',
                        sql: 'SELECT * FROM src',
                        references: { src: queryUuid },
                        pivotConfiguration,
                    },
                ],
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
            if (!submission) throw new Error('Pivot query was not submitted');
            return submission.queryUuid;
        },
        enabled: !!queryUuid && pivotConfiguration !== null,
        staleTime: Infinity,
        retry: false,
    });
};

type Props = {
    projectUuid: string;
    /** The terminal node's result of this run. */
    queryUuid: string;
    vizConfig: ComposerRunQueryVizConfig;
    metadata: { title: string; description: string };
    onScreenshotReady: () => void;
    onScreenshotError: () => void;
};

/**
 * Spike: a composer node result drawn by the runQuery chart builders, with
 * field metadata synthesized from the result columns.
 */
export const AiComposerRunQueryVisualization: FC<Props> = ({
    projectUuid,
    queryUuid,
    vizConfig,
    metadata,
    onScreenshotReady,
    onScreenshotError,
}) => {
    const { data: palette } = useProjectColorPalette(projectUuid, {});
    const colorPalette = palette?.colors ?? ECHARTS_DEFAULT_COLORS;

    const nodeResults = useInfiniteQueryResults(projectUuid, queryUuid);
    const columns = useMemo(
        () => Object.values(nodeResults.columns ?? {}),
        [nodeResults.columns],
    );

    const customChartType = isComposerCustomChartTypeVizConfig(vizConfig)
        ? vizConfig
        : null;
    const { data: renderMetadata } = useDataAppVizRenderMetadata(
        projectUuid,
        customChartType?.dataAppVizUuid ?? null,
        DATA_APP_VIZ_RENDER_TARGET,
        customChartType?.dataAppVizVersion ?? undefined,
    );
    const seriesSlots = useMemo(
        () =>
            renderMetadata?.state === 'ready'
                ? renderMetadata.schema.fields
                      .filter((field) => field.type === 'series')
                      .map((field) => field.name)
                : null,
        [renderMetadata],
    );

    const chart = useMemo((): ComposerRunQueryChart | Error | null => {
        if (columns.length === 0) return null;
        if (customChartType && seriesSlots === null) return null;
        try {
            return getComposerRunQueryChart({
                columns,
                vizConfig,
                metadata,
                customChartTypeSeriesSlots: seriesSlots ?? [],
            });
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    }, [columns, customChartType, seriesSlots, vizConfig, metadata]);
    const readyChart = chart instanceof Error ? null : chart;
    // The provider expands pivoted series; fed back so series colors resolve.
    const [expandedChartConfig, setExpandedChartConfig] =
        useState<ChartConfig | null>(null);

    const pivot = usePivotedQueryUuid(
        projectUuid,
        queryUuid,
        readyChart?.pivotConfiguration ?? null,
    );
    const needsPivot = !!readyChart?.pivotConfiguration;
    const pivotedResults = useInfiniteQueryResults(
        projectUuid,
        needsPivot ? pivot.data : undefined,
    );
    const results = needsPivot ? pivotedResults : nodeResults;

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    const apiError = nodeResults.error ?? pivotedResults.error;
    const errorMessage =
        chart instanceof Error
            ? chart.message
            : renderMetadata?.state === 'unavailable'
              ? 'Custom chart type bundle is unavailable'
              : (pivot.error?.message ?? apiError?.error.message ?? null);
    useEffect(() => {
        if (errorMessage) onScreenshotError();
    }, [errorMessage, onScreenshotError]);

    const resultsData = useMemo(
        () =>
            readyChart
                ? {
                      ...results,
                      metricQuery: readyChart.metricQuery,
                      fields: readyChart.fields,
                  }
                : null,
        [results, readyChart],
    );

    if (errorMessage) {
        return (
            <Center h="100%">
                <Text size="sm" c="red">
                    {errorMessage}
                </Text>
            </Center>
        );
    }
    if (
        !readyChart ||
        !resultsData ||
        (needsPivot && !pivot.data) ||
        !results.hasFetchedAllRows
    ) {
        return null;
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
};

import {
    getErrorMessage,
    getItemId,
    isApiError,
    type Item,
    type ItemsMap,
    type MetricQuery,
    type SavedChart,
    type ReadyQueryResultsPage,
    type ResultRow,
    type SubtotalLevelRequest,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import { type SavedChartBindingSource } from '../utils/savedChartPreviewFieldMapping';
import {
    executeSavedChartPreviewQuery,
    type SavedChartPreviewQueryResult,
} from '../utils/savedChartPreviewQuery';

/** The one run backing a builder session, and what the UI says about it. */
export type SavedChartPreviewData =
    | { status: 'notRun' }
    | { status: 'running'; chartName: string | null; spaceName: string | null }
    | {
          status: 'error';
          chartName: string | null;
          spaceName: string | null;
          message: string;
      }
    | {
          status: 'ready';
          sourceChart:
              | (SavedChartBindingSource &
                    Pick<SavedChart, 'parameters' | 'merge'> & {
                        originalMetricQuery: MetricQuery;
                    })
              | null;
          chartName: string | null;
          spaceName: string | null;
          rows: ResultRow[];
          itemsMap: ItemsMap;
          /** Result columns, dimensions before metrics. */
          columns: Item[];
          pivotDetails: ReadyQueryResultsPage['pivotDetails'];
          rowCount: number;
          ranAt: Date;
      };

/** The run plus the control that re-issues it. */
export type SavedChartPreviewRun = {
    data: SavedChartPreviewData;
    retry: () => void;
};

type Args = {
    projectUuid: string | undefined;
    enabled: boolean;
    /** The saved chart the session runs against; null runs nothing. */
    savedChartUuid: string | null;
    /** Null waits for hierarchy bindings; undefined runs the legacy preview. */
    subtotalLevel?: SubtotalLevelRequest | null;
    sourceMetadataError?: string | null;
    retrySourceMetadata?: () => void;
};

/**
 * Run the selected saved chart's query once and keep its rows for the session.
 *
 * Keyed by the chart alone, so the preview and the build share a single run.
 * A refresh re-runs it once: the selection lives in the URL, and nothing
 * persists the rows.
 */
export const useSavedChartPreviewData = ({
    projectUuid,
    savedChartUuid,
    enabled: canPreview,
    subtotalLevel,
    sourceMetadataError,
    retrySourceMetadata,
}: Args): SavedChartPreviewRun => {
    const metadataEnabled =
        canPreview && Boolean(projectUuid) && savedChartUuid !== null;
    const savedChart = useSavedQuery({
        uuidOrSlug: savedChartUuid ?? undefined,
        projectUuid,
        useQueryOptions: { enabled: metadataEnabled },
    });
    const enabled =
        metadataEnabled &&
        subtotalLevel !== null &&
        (!subtotalLevel || !!savedChart.data);
    const run = useQuery<SavedChartPreviewQueryResult, Error>({
        queryKey: [
            'chart-type-saved-chart-preview',
            projectUuid,
            savedChartUuid,
            subtotalLevel,
            subtotalLevel ? savedChart.data?.metricQuery : undefined,
        ],
        queryFn: () =>
            executeSavedChartPreviewQuery({
                projectUuid: projectUuid ?? '',
                chartUuid: savedChartUuid ?? '',
                ...(subtotalLevel
                    ? {
                          subtotalLevel,
                          sourceMetricQuery: savedChart.data?.metricQuery,
                      }
                    : {}),
            }),
        enabled,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    const chartName = savedChart.data?.name ?? null;
    const spaceName = savedChart.data?.spaceName ?? null;
    const { data, error, refetch } = run;
    const ranAt = run.dataUpdatedAt;
    const { error: metadataError, refetch: refetchMetadata } = savedChart;

    return useMemo(() => {
        const retry = () => {
            if (metadataEnabled) void refetchMetadata();
            if (metadataEnabled) retrySourceMetadata?.();
            if (enabled) void refetch();
        };
        if (!metadataEnabled) return { data: { status: 'notRun' }, retry };
        if (error || metadataError || sourceMetadataError)
            return {
                data: {
                    status: 'error',
                    chartName,
                    spaceName,
                    message:
                        error?.message ??
                        sourceMetadataError ??
                        (isApiError(metadataError)
                            ? metadataError.error.message
                            : getErrorMessage(metadataError)),
                },
                retry,
            };
        if (!enabled)
            return {
                data: { status: 'running', chartName, spaceName },
                retry,
            };
        if (!data || !savedChart.data)
            return {
                data: { status: 'running', chartName, spaceName },
                retry,
            };
        const { dimensions, metrics } = getDataAppVizFieldItems(data.itemsMap);
        const resultColumns = data.resultColumnIds
            ? new Set(data.resultColumnIds)
            : null;
        return {
            data: {
                status: 'ready',
                chartName,
                spaceName,
                sourceChart: {
                    ...savedChart.data,
                    originalMetricQuery: savedChart.data.metricQuery,
                    metricQuery:
                        data.metricQuery ?? savedChart.data.metricQuery,
                },
                rows: data.rows,
                itemsMap: data.itemsMap,
                columns: [...dimensions, ...metrics].filter(
                    (item) =>
                        !resultColumns || resultColumns.has(getItemId(item)),
                ),
                pivotDetails: data.pivotDetails,
                rowCount: data.rows.length,
                ranAt: new Date(ranAt),
            },
            retry,
        };
    }, [
        enabled,
        metadataEnabled,
        chartName,
        spaceName,
        data,
        error,
        ranAt,
        refetch,
        savedChart.data,
        metadataError,
        refetchMetadata,
        sourceMetadataError,
        retrySourceMetadata,
    ]);
};

import {
    getErrorMessage,
    isApiError,
    type Item,
    type ItemsMap,
    type MetricQuery,
    type SavedChart,
    type ReadyQueryResultsPage,
    type ResultRow,
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
}: Args): SavedChartPreviewRun => {
    const enabled =
        canPreview && Boolean(projectUuid) && savedChartUuid !== null;
    const savedChart = useSavedQuery({
        uuidOrSlug: savedChartUuid ?? undefined,
        projectUuid,
        useQueryOptions: { enabled },
    });
    const run = useQuery<SavedChartPreviewQueryResult, Error>({
        queryKey: [
            'chart-type-saved-chart-preview',
            projectUuid,
            savedChartUuid,
        ],
        queryFn: () =>
            executeSavedChartPreviewQuery({
                projectUuid: projectUuid ?? '',
                chartUuid: savedChartUuid ?? '',
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
            if (enabled) {
                void refetch();
                void refetchMetadata();
            }
        };
        if (!enabled) return { data: { status: 'notRun' }, retry };
        if (error || metadataError)
            return {
                data: {
                    status: 'error',
                    chartName,
                    spaceName,
                    message:
                        error?.message ??
                        (isApiError(metadataError)
                            ? metadataError.error.message
                            : getErrorMessage(metadataError)),
                },
                retry,
            };
        if (!data || !savedChart.data)
            return {
                data: { status: 'running', chartName, spaceName },
                retry,
            };
        const { dimensions, metrics } = getDataAppVizFieldItems(data.itemsMap);
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
                columns: [...dimensions, ...metrics],
                pivotDetails: data.pivotDetails,
                rowCount: data.rows.length,
                ranAt: new Date(ranAt),
            },
            retry,
        };
    }, [
        enabled,
        chartName,
        spaceName,
        data,
        error,
        ranAt,
        refetch,
        savedChart.data,
        metadataError,
        refetchMetadata,
    ]);
};

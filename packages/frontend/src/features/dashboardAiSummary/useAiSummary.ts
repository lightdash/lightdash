import {
    type ApiError,
    type DashboardAiSummaryTile,
    type DataAppDetection,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { detectAnalysisAnomalies } from '../analysis/api';
import { sourcesSignature } from '../analysis/sourcesSignature';
import { useAnalysisAvailability } from '../apps/analysis/useDataAppAnalysisAvailability';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import { DEFAULT_AI_SUMMARY_INSTRUCTIONS } from './aiSummaryDefaults';
import { getAiSummarySources } from './aiSummarySources';

export const useAiSummary = ({
    tile,
    projectUuid,
    dashboardUuid,
    enabled,
}: {
    tile: DashboardAiSummaryTile;
    projectUuid: string | undefined;
    dashboardUuid: string | undefined;
    enabled: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const availability = useAnalysisAvailability();
    const tiles = useDashboardSelector(selectDashboardTiles);
    const tileQueries = useDashboardSelector(
        (state) => state.tileStatus.tileQueries,
    );
    const { sources, inFlight, charts } = useMemo(
        () => getAiSummarySources(tile, tiles ?? [], tileQueries),
        [tile, tiles, tileQueries],
    );
    const instructions =
        tile.properties.instructions?.trim() || DEFAULT_AI_SUMMARY_INSTRUCTIONS;
    const queryKey = [
        'dashboard-ai-summary',
        projectUuid,
        dashboardUuid,
        instructions,
        sourcesSignature(sources),
    ];
    const canRun =
        enabled &&
        availability.status === 'available' &&
        projectUuid !== undefined &&
        dashboardUuid !== undefined &&
        !inFlight &&
        sources.length > 0;

    const run = (force: boolean) =>
        detectAnalysisAnomalies(lightdashApi, {
            projectUuid: projectUuid!,
            target: { kind: 'dashboard', dashboardUuid: dashboardUuid! },
            sources,
            instructions,
            force,
        });

    // Detect serves a stored analysis of identical rows before running the
    // model, so reopening a view or sharing it across viewers costs nothing.
    const query = useQuery<DataAppDetection, ApiError>({
        queryKey,
        queryFn: () => run(false),
        enabled: canRun,
        keepPreviousData: true,
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
    });

    const regenerate = useMutation<DataAppDetection, ApiError>({
        mutationFn: () => run(true),
        onSuccess: (data) => queryClient.setQueryData(queryKey, data),
    });

    return {
        availability,
        charts,
        hasSources: sources.length > 0,
        isWaitingForCharts: inFlight,
        summary: query.data,
        isUpdating:
            regenerate.isLoading ||
            query.isFetching ||
            (inFlight && query.data !== undefined),
        error: regenerate.error ?? query.error,
        regenerate: regenerate.mutate,
        canRegenerate: canRun,
    };
};

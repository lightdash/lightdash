import {
    DEVELOPMENT_PREVIEW_HEADER,
    type ApiError,
    type ApiQueryResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { PUBLISHED_HEADERS } from './developmentView';

type Totals = Record<string, { raw: unknown; formatted: string }>;

/** Reads the models as published, whatever the app is switched to. */
const LIVE_HEADERS = {
    ...PUBLISHED_HEADERS,
    // Also clears a preview project the client would otherwise send.
    [DEVELOPMENT_PREVIEW_HEADER]: '',
};

/** Each metric's total over every row of the model, as the given headers read it. */
const useTotals = (
    projectUuid: string,
    exploreName: string,
    metricIds: string[],
    headers: Record<string, string>,
    enabled: boolean,
    /** What the changes hold, so totals are read again when they change. */
    cacheKey: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Totals, ApiError>({
        queryKey: [
            'semantic-layer-draft-totals',
            projectUuid,
            exploreName,
            headers,
            metricIds,
            cacheKey,
        ],
        queryFn: async () => {
            const results = await lightdashApi<ApiQueryResults>({
                url: `/projects/${projectUuid}/explores/${exploreName}/runQuery`,
                method: 'POST',
                // Each side says which models it reads, whatever the app is switched to.
                headers,
                body: JSON.stringify({
                    exploreName,
                    dimensions: [],
                    metrics: metricIds,
                    filters: {},
                    sorts: [],
                    limit: 1,
                    tableCalculations: [],
                    additionalMetrics: [],
                }),
            });
            const [row] = results.rows;
            return Object.fromEntries(
                metricIds.map((id) => [
                    id,
                    row?.[id]?.value ?? { raw: null, formatted: '∅' },
                ]),
            );
        },
        enabled,
        // A save changes the key; the last totals stay until the new ones are read.
        keepPreviousData: true,
        retry: false,
        staleTime: 60_000,
    });
};

/** Each metric's total with the person's changes, and live for those that are live already. */
export const useMetricShift = (
    projectUuid: string,
    model: string,
    {
        ids,
        liveIds,
        headers,
        cacheKey,
    }: {
        ids: string[];
        liveIds: string[];
        /** Where the person's changes are read from. */
        headers: Record<string, string>;
        cacheKey: string;
    },
) => ({
    after: useTotals(
        projectUuid,
        model,
        ids,
        headers,
        ids.length > 0,
        cacheKey,
    ),
    before: useTotals(
        projectUuid,
        model,
        liveIds,
        LIVE_HEADERS,
        liveIds.length > 0,
        cacheKey,
    ),
});

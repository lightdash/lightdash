import { type ApiError, type ApiQueryResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';

type Totals = Record<string, { raw: unknown; formatted: string }>;

/** Reads the models as published, whatever the app is switched to. */
export const LIVE_HEADERS = {
    [DEVELOPMENT_VIEW_HEADER]: 'false',
    [DEVELOPMENT_PREVIEW_HEADER]: '',
};

/** Each metric's total over every row of the model, as the given headers read it. */
export const useTotals = (
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
        retry: false,
        staleTime: 60_000,
    });
};

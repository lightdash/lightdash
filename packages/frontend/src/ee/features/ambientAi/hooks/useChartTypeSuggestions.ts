import {
    type ApiError,
    type SuggestChartTypeExploreRequest,
    type SuggestChartTypeFieldsRequest,
    type SuggestedChartTypeExplore,
    type SuggestedChartTypeExploreResult,
    type SuggestedChartTypeFields,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

/** Anything slower than this is dropped in favour of the non-AI behaviour. */
const CHART_TYPE_SUGGESTION_TIMEOUT_MS = 6000;

const withTimeout = async <T>(
    request: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal | undefined,
): Promise<T> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const timeoutId = setTimeout(abort, CHART_TYPE_SUGGESTION_TIMEOUT_MS);
    try {
        return await request(controller.signal);
    } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abort);
    }
};

/** Which fields of a table fit a chart type's declared inputs. Rejects on
 *  error, on timeout and when `signal` aborts. */
export const suggestChartTypeFields = (
    projectUuid: string,
    payload: SuggestChartTypeFieldsRequest,
    signal?: AbortSignal,
) =>
    withTimeout(
        (timeoutSignal) =>
            lightdashApi<SuggestedChartTypeFields>({
                url: `/ai/${projectUuid}/chart-type/suggest-fields`,
                method: 'POST',
                body: JSON.stringify(payload),
                signal: timeoutSignal,
            }),
        signal,
    );

const suggestChartTypeExplore = (
    projectUuid: string,
    payload: SuggestChartTypeExploreRequest,
) =>
    withTimeout(
        (timeoutSignal) =>
            lightdashApi<SuggestedChartTypeExploreResult>({
                url: `/ai/${projectUuid}/chart-type/suggest-explore`,
                method: 'POST',
                body: JSON.stringify(payload),
                signal: timeoutSignal,
            }),
        undefined,
    );

/**
 * The table that best fits a built chart type. Cached per request for the
 * session, so reopening the picker never asks again. Null
 * while loading, on failure, or when nothing fits.
 */
export const useSuggestedChartTypeExplore = (
    projectUuid: string | undefined,
    request: SuggestChartTypeExploreRequest | null,
): SuggestedChartTypeExplore | null => {
    const { data } = useQuery<SuggestedChartTypeExploreResult, ApiError>({
        queryKey: ['chart-type-suggest-explore', projectUuid, request],
        // Closing the picker mid-request keeps it running, so the answer is
        // cached for the next open.
        queryFn: () =>
            request
                ? suggestChartTypeExplore(projectUuid ?? '', request)
                : Promise.resolve({ suggestion: null }),
        enabled: Boolean(projectUuid) && request !== null,
        retry: false,
        staleTime: Infinity,
        cacheTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    return data?.suggestion ?? null;
};

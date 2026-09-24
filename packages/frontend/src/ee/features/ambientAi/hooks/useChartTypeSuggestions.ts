import {
    type SuggestChartTypeFieldsRequest,
    type SuggestedChartTypeFields,
} from '@lightdash/common';
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

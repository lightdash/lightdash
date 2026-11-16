import { ParameterError } from '@lightdash/common';
import type { MeteredLiveSource } from '../calls';
import type { LiveColumn } from '../types';

export type LiveQueryResult = {
    columns: LiveColumn[];
    rows: Record<string, unknown>[];
    /**
     * True when the API had rows past the ones read. A query sorted on our
     * side is refused then, see assertLiveResultComplete.
     */
    hasMoreRows: boolean;
    /** Bytes the API reports reading, or null when it doesn't report them. */
    bytesRead: number | null;
};

/** Reads one query written in the integration's request language and runs it. */
export const runLiveRequest = async (
    {
        integration,
        settings,
        calls,
    }: Pick<MeteredLiveSource, 'integration' | 'settings' | 'calls'>,
    { query, limit }: { query: string; limit: number },
): Promise<LiveQueryResult> => {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new ParameterError('limit must be a positive number of rows');
    }
    const request = integration.parseRequest(query);
    const result = await integration.run({ settings, request, limit, calls });
    return { bytesRead: null, ...result };
};

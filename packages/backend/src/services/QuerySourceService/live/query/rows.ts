import { ParameterError, toLiveSourceErrorData } from '@lightdash/common';

/**
 * The error every live data source gives when a query has more rows than one
 * query can read: answering from part of the rows would sort and total wrong.
 * A refusal, so telemetry files it as the source's limit, not our failure.
 */
export const tooManyRowsError = ({
    label,
    maxRows,
}: {
    label: string;
    maxRows: number;
}): ParameterError =>
    new ParameterError(
        `This ${label} query has more than ${maxRows.toLocaleString(
            'en-US',
        )} rows, the most one query can read, so its result would be incomplete. Narrow the date range, add a filter or remove a dimension.`,
        toLiveSourceErrorData('live_source.refused.row_limit'),
    );

type ApiSourcePage = {
    rows: Record<string, unknown>[];
    /** Where the next page starts, when there is one. */
    nextCursor?: string;
};

/**
 * Reads one row past the limit, over as many pages as a query may fetch, to
 * tell a full result from a cut-off one. Rows past what a query can read would
 * sort and total as if they didn't exist, so that query is refused instead of
 * answered from part of its rows.
 */
export const readRowsWithinCap = async ({
    label,
    requestedRows,
    maxRows,
    pageSize,
    maxPages,
    fetchPage,
}: {
    label: string;
    requestedRows: number;
    /** The most rows one query can read. */
    maxRows: number;
    pageSize: number;
    maxPages: number;
    fetchPage: (request: {
        limit: number;
        cursor: string | undefined;
    }) => Promise<ApiSourcePage>;
}): Promise<{
    rows: Record<string, unknown>[];
    hasMoreRows: boolean;
}> => {
    const rowLimit = Math.min(requestedRows, maxRows);
    const rows: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    let hasMore = false;
    for (let page = 0; page < maxPages; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await fetchPage({
            limit: Math.min(pageSize, rowLimit + 1 - rows.length),
            cursor,
        });
        rows.push(...result.rows);
        cursor = result.nextCursor;
        hasMore = cursor !== undefined;
        if (!hasMore || rows.length > rowLimit) {
            break;
        }
    }

    const ranOutOfPages = hasMore && rows.length <= rowLimit;
    const hitTheCap = rows.length > rowLimit && rowLimit < requestedRows;
    if (ranOutOfPages || hitTheCap) {
        throw tooManyRowsError({ label, maxRows });
    }

    return {
        rows: rows.slice(0, rowLimit),
        hasMoreRows: rows.length > rowLimit,
    };
};

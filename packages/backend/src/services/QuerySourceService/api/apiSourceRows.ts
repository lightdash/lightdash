import { ParameterError } from '@lightdash/common';

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
    truncated: boolean;
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
        throw new ParameterError(
            `${label} has more rows than the ${maxRows.toLocaleString(
                'en-US',
            )} one query can read, so this result would be incomplete. Narrow the date range, add a filter or remove a dimension.`,
        );
    }

    return {
        rows: rows.slice(0, rowLimit),
        truncated: rows.length > rowLimit,
    };
};

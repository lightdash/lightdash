// States the row count and the limit behind it, so the agent never infers one.
export const getQueryResultSummary = ({
    rowCount,
    requestedLimit,
    effectiveLimit,
    maxLimit,
}: {
    rowCount: number;
    // What the tool call asked for; null means "use the maximum".
    requestedLimit: number | null;
    // What was applied, after null-resolution and clamping.
    effectiveLimit: number;
    maxLimit: number;
}): string => {
    if (rowCount < effectiveLimit) {
        return `Returned all ${rowCount} rows matching this query. The row limit of ${effectiveLimit} was not reached and nothing was truncated.`;
    }

    const limitSource = (() => {
        if (requestedLimit === null) {
            return `this tool call requested no limit, so this tool's maximum of ${maxLimit} was applied`;
        }
        if (requestedLimit > maxLimit) {
            return `this tool call requested ${requestedLimit}, capped to this tool's maximum of ${maxLimit}`;
        }
        return `this tool call requested ${requestedLimit}; it is not a system, display, or platform limit`;
    })();

    return `Returned ${rowCount} rows, reaching the row limit of ${effectiveLimit}, so more rows may exist. The limit applied because ${limitSource}.`;
};

/**
 * States that only part of the result was written into the conversation, so the
 * agent never mistakes the rows it can see for the whole result. This is about
 * context size, not the query's own limit — the query returned every row above.
 */
export const getContextTruncationNote = ({
    rowCount,
    maxContextRows,
}: {
    rowCount: number;
    maxContextRows: number;
}): string =>
    rowCount <= maxContextRows
        ? ''
        : ` Only the first ${maxContextRows} of those ${rowCount} rows are shown here to keep this conversation small; the query returned all of them and the full result is retained server-side. Reason from the row count and the values you can see, and query an aggregate if you need a figure that spans the rows that are not shown.`;

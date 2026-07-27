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

/**
 * Tells the model how many rows came back and why, so it never has to infer a
 * reason for the row count. Without this the model sees exactly N rows and
 * invents an explanation — reporting its own chosen limit as a system limit.
 */
export const getQueryResultSummary = ({
    rowCount,
    requestedLimit,
    effectiveLimit,
    maxLimit,
}: {
    rowCount: number;
    // What the tool call asked for; null means "use the maximum".
    requestedLimit: number | null;
    // What was actually applied, after null-resolution and clamping.
    effectiveLimit: number;
    maxLimit: number;
}): string => {
    if (rowCount < effectiveLimit) {
        return `Returned all ${rowCount} rows matching this query. The row limit (${effectiveLimit}) was not reached, so nothing was truncated — do not describe this result as capped or limited.`;
    }

    const limitSource = (() => {
        if (requestedLimit === null) {
            return `no limit was requested in this tool call, so the maximum this tool allows (${maxLimit}) was applied`;
        }
        if (requestedLimit > maxLimit) {
            return `this tool call requested ${requestedLimit}, which was capped to the maximum this tool allows (${maxLimit})`;
        }
        return `this tool call requested a limit of ${requestedLimit} — that is the limit chosen for this query, not a system, display, or platform limit`;
    })();

    return `Returned ${rowCount} rows, which matches the row limit of ${effectiveLimit}, so there may be more rows. Reason for the limit: ${limitSource}. If you mention the row count, describe the limit accurately using this information.`;
};

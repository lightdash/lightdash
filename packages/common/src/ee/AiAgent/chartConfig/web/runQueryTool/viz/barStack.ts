/** Stack ids as the chart renderer assigns them. */
export const getBarStackId = (
    metric: string,
    groupBy: string[] | null,
): string => (groupBy && groupBy.length > 0 ? metric : 'stack-all-series');

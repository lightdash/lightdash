/** The renderer's stack ids: one per metric when groupBy pivots, one shared otherwise. */
export const getBarStackId = (
    metric: string,
    groupBy: string[] | null | undefined,
): string => (groupBy && groupBy.length > 0 ? metric : 'stack-all-series');

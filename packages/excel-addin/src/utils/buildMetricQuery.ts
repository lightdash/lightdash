type FilterRule = {
    id: string;
    target: { fieldId: string };
    operator: string;
    values: string[];
};

type BuildMetricQueryInput = {
    metrics: string[];
    dimensions: string[];
    filters: FilterRule[];
    sorts: Array<{ fieldId: string; descending: boolean }>;
    limit: number;
};

export const buildMetricQuery = (input: BuildMetricQueryInput) => ({
    metrics: input.metrics,
    dimensions: input.dimensions,
    filters: input.filters.length
        ? { dimensions: { or: input.filters } }
        : undefined,
    sorts: input.sorts,
    limit: input.limit,
});

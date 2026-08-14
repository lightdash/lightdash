type SelectedFields = {
    dimensions: string[];
    metrics: string[];
};

export const isMergeSourceReady = (query: SelectedFields): boolean =>
    query.dimensions.length > 0 && query.metrics.length > 0;

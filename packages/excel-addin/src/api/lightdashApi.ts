export const normalizeMetricQuery = (payload: any) => ({
    ...payload,
    filters:
        payload.filters && Object.keys(payload.filters).length
            ? payload.filters
            : undefined,
    sorts: payload.sorts && payload.sorts.length ? payload.sorts : undefined,
});

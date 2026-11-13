export const QUERY_POLLING_SOURCES = ['scheduler', 'other'] as const;

export type QueryPollingSource = (typeof QUERY_POLLING_SOURCES)[number];

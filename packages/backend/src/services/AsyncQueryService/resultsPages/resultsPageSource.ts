export const RESULTS_PAGE_SOURCES = ['stored', 'built', 'fallback'] as const;

export type ResultsPageSource = (typeof RESULTS_PAGE_SOURCES)[number];

export const RESULTS_PAGE_SOURCES = [
    'inline',
    'built',
    'shared',
    'stored',
    'busy',
] as const;

export type ResultsPageSource = (typeof RESULTS_PAGE_SOURCES)[number];

export const RESULTS_PAGE_BUILD_OUTCOMES = ['ok', 'error', 'dropped'] as const;

export type ResultsPageBuildOutcome =
    (typeof RESULTS_PAGE_BUILD_OUTCOMES)[number];

export type ResultsPageStats = {
    queuedBuilds: number;
    uploadBytes: number;
    decompressBytes: number;
};

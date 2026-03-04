import { type DateGranularity } from '../types/timeFrames';

const GRANULARITY_PATTERN = /\$\{([^}]+)\.granularity\}/g;

export type GranularityMap = Record<string, DateGranularity>;

export const resolveGranularityInLabel = (
    label: string | undefined,
    granularityMap: GranularityMap,
): string | undefined => {
    if (label === undefined) return undefined;
    if (Object.keys(granularityMap).length === 0) return label;
    return label.replaceAll(
        GRANULARITY_PATTERN,
        (match, fieldBaseId: string) => {
            const granularity = granularityMap[fieldBaseId];
            return granularity ? granularity.toLowerCase() : match;
        },
    );
};

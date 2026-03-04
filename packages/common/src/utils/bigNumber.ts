import { type DateGranularity } from '../types/timeFrames';

const GRANULARITY_PLACEHOLDER = '${granularity}';

export const resolveGranularityInLabel = (
    label: string | undefined,
    granularity: DateGranularity | undefined,
): string | undefined => {
    if (label === undefined) return undefined;
    if (granularity === undefined) return label;
    return label.replaceAll(GRANULARITY_PLACEHOLDER, granularity.toLowerCase());
};

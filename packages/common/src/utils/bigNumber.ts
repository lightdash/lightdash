import { isDimension, type ItemsMap } from '../types/field';
import {
    getGranularityReferenceValue,
    timeFrameToDateGranularityMap,
    type DateGranularity,
} from '../types/timeFrames';

const GRANULARITY_PATTERN = /\$\{([^}]+)\.granularity\}/g;

export type GranularityMap = Record<string, DateGranularity | string>;

// Builds a base-field-id → active-granularity map from the query's items. The
// fields already reflect the effective grain (date zoom is applied server-side
// and the returned dimensions carry the resulting `timeInterval`), so labels
// resolve straight from each field without a separate date-zoom override.
export const getGranularityMapFromItems = (
    itemsMap: ItemsMap | undefined,
): GranularityMap => {
    if (!itemsMap) return {};

    const map: GranularityMap = {};
    for (const field of Object.values(itemsMap)) {
        if (
            isDimension(field) &&
            field.timeIntervalBaseDimensionName &&
            (field.timeInterval || field.customTimeInterval)
        ) {
            const baseId = `${field.table}_${field.timeIntervalBaseDimensionName}`;

            if (field.customTimeInterval) {
                map[baseId] = field.label;
            } else if (field.timeInterval) {
                const granularity =
                    timeFrameToDateGranularityMap[field.timeInterval];
                if (granularity) {
                    map[baseId] = granularity;
                }
            }
        }
    }
    return map;
};

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
            return granularity
                ? getGranularityReferenceValue(granularity)
                : match;
        },
    );
};

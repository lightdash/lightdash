import { type DateZoom } from '../types/api/paginatedQuery';
import { isDimension, type ItemsMap } from '../types/field';
import {
    getGranularityReferenceValue,
    timeFrameToDateGranularityMap,
    type DateGranularity,
} from '../types/timeFrames';

const GRANULARITY_PATTERN = /\$\{([^}]+)\.granularity\}/g;

export type GranularityMap = Record<string, DateGranularity | string>;

export const getGranularityMapFromItems = (
    itemsMap: ItemsMap | undefined,
    dateZoom?: DateZoom,
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

            if (dateZoom?.xAxisFieldId === baseId && dateZoom.granularity) {
                map[baseId] = dateZoom.granularity;
            } else if (field.customTimeInterval) {
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

import { isDimension, type ItemsMap } from '../types/field';
import {
    getGranularityReferenceValue,
    timeFrameToDateGranularityMap,
    type DateGranularity,
} from '../types/timeFrames';

const GRANULARITY_PATTERN = /\$\{([^}]+)\.granularity\}/g;

/** A standard grain whose label was overridden via project `granularity_labels`.
 *  Carried verbatim so chart labels show it as-authored, unlike
 *  standard/custom grains which are lowercased for the label. */
type VerbatimGranularity = { verbatim: string };

export type GranularityMap = Record<
    string,
    DateGranularity | string | VerbatimGranularity
>;

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
                    // A project `granularity_labels` override is baked onto the
                    // dimension as `timeIntervalLabel`; render it verbatim.
                    map[baseId] = field.timeIntervalLabel
                        ? { verbatim: field.timeIntervalLabel }
                        : granularity;
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
            if (!granularity) return match;
            // Overridden standard grains carry a verbatim label; everything
            // else (DateGranularity, custom label) is lowercased as before.
            if (typeof granularity === 'object') return granularity.verbatim;
            return getGranularityReferenceValue(granularity);
        },
    );
};

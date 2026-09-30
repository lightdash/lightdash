import { calculateSeriesLikeIdentifier, type SeriesLike } from './series';

/**
 * A unique key used to track the latest index assigned within a group,
 * within the color mappings Map.
 */
export const ASSIGNMENT_IDX_KEY = '$___idx';

/**
 * identifier -> palette index, per group. Shared across every chart on a page
 * so the same group value gets the same color in each of them. The frontend
 * keeps one per route; a headless caller keeps one per render.
 */
export type ColorMappings = Map<string, Map<string, number>>;

export const createColorMappings = (): ColorMappings => new Map();

export type ColorAssignmentOptions = {
    colorPalette: string[];
    colorMappings: ColorMappings;
    /** Color for null and empty group values, the same everywhere. */
    nullColor: string;
};

/**
 * Given the org's color palette, and an identifier, return the color palette value
 * for said identifier.
 *
 * This works by taking a group and identifier, and cycling through the color palette
 * colors on a first-come first-serve basis, scoped to a particular group of identifiers.
 *
 * 'Group' will generally be something like a table or model name, e.g 'customer',
 * 'Identifier' will generally be something like a field name, or a group value.
 *
 * Because this color cycling is done per group, it allows unrelated charts/series
 * to cycle through colors in the palette in parallel.
 */
export const calculateKeyColorAssignment = (
    { colorPalette, colorMappings, nullColor }: ColorAssignmentOptions,
    group: string,
    identifier: string,
): string => {
    // Ensure we always color null the same:
    if (!identifier || identifier === 'null') {
        return nullColor;
    }

    let groupMappings = colorMappings.get(group);

    /**
     * If we already picked a color for this group/identifier pair, return it:
     */
    if (groupMappings && groupMappings.has(identifier)) {
        return colorPalette[groupMappings.get(identifier)!];
    }

    /**
     * If this is the first time we're seeing this group, create a sub-map for it:
     */
    if (!groupMappings) {
        groupMappings = new Map<string, number>();
        colorMappings.set(group, groupMappings);
    }

    /**
     * Figure out the last color assigned in this group, and either pick the
     * next color in the palette, or start over from 0.
     */
    const currentIdx = groupMappings.get(ASSIGNMENT_IDX_KEY) ?? -1;
    const nextIdx = currentIdx === colorPalette.length - 1 ? 0 : currentIdx + 1;
    const colorHex = colorPalette[nextIdx];

    // Keep track of the current value of the color idx for this group:
    groupMappings.set(ASSIGNMENT_IDX_KEY, nextIdx);

    // Keep track of the color idx used for this identifier, within this group:
    groupMappings.set(identifier, nextIdx);

    return colorHex;
};

export const calculateSeriesColorAssignment = (
    options: ColorAssignmentOptions,
    series: SeriesLike,
): string => {
    const [baseField, completeIdentifier] =
        calculateSeriesLikeIdentifier(series);

    return calculateKeyColorAssignment(options, baseField, completeIdentifier);
};

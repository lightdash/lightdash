// Mapping of Leaflet zoom level → H3 resolution for the "Dynamic" sizing mode.
// Lower numbers produce bigger hex cells. This mapping is intentionally
// one step coarser than what the H3 reference table would suggest, since
// at typical chart sizes (a few hundred px tall) finer resolutions look
// noisy. If you want bigger bins, decrement values; for smaller, increment.
const ZOOM_TO_RES: readonly number[] = [
    1,
    1,
    1,
    1, // zoom 0,1,2,3
    2, // zoom 4
    3, // zoom 5
    4,
    4, // zoom 6,7
    5,
    5, // zoom 8,9
    6, // zoom 10
    7, // zoom 11
    8, // zoom 12
    9, // zoom 13
    10, // zoom 14
    11, // zoom 15
];

const MAX_H3_RESOLUTION = 11;

export const zoomToResolution = (zoom: number): number => {
    const z = Math.floor(zoom);
    if (z < 0) return ZOOM_TO_RES[0];
    if (z >= ZOOM_TO_RES.length) return MAX_H3_RESOLUTION;
    return ZOOM_TO_RES[z];
};

/** Friendly preset sizes for the "Fixed" sizing mode. Values are H3 resolutions. */
export type HexbinSizePreset = {
    key:
        | 'block'
        | 'neighborhood'
        | 'district'
        | 'city'
        | 'metro'
        | 'region'
        | 'country'
        | 'continent';
    resolution: number;
};

// Ordered smallest → largest so the slider reads left-to-right naturally
// (left = small/fine bins, right = large/coarse bins).
export const HEXBIN_SIZE_PRESETS: readonly HexbinSizePreset[] = [
    { key: 'block', resolution: 9 },
    { key: 'neighborhood', resolution: 7 },
    { key: 'district', resolution: 6 },
    { key: 'city', resolution: 5 },
    { key: 'metro', resolution: 4 },
    { key: 'region', resolution: 3 },
    { key: 'country', resolution: 2 },
    { key: 'continent', resolution: 1 },
];

export const DEFAULT_FIXED_RESOLUTION = 4;

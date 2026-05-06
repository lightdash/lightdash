const ZOOM_TO_RES: readonly number[] = [
    1,
    1,
    1, // zoom 0,1,2
    2, // zoom 3
    3, // zoom 4
    4, // zoom 5
    5,
    5, // zoom 6,7
    6,
    6, // zoom 8,9
    7, // zoom 10
    8, // zoom 11
    9, // zoom 12
    10, // zoom 13
    11, // zoom 14
    12, // zoom 15
];

const MAX_H3_RESOLUTION = 12;

export const zoomToResolution = (zoom: number): number => {
    const z = Math.floor(zoom);
    if (z < 0) return ZOOM_TO_RES[0];
    if (z >= ZOOM_TO_RES.length) return MAX_H3_RESOLUTION;
    return ZOOM_TO_RES[z];
};

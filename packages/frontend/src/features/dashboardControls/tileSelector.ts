export const getTileSelector = (tileUuid: string) =>
    `[data-tile-uuid="${tileUuid}"]`;

// The veil swallows pointer events so the grid does not drag or click through
export const stopPropagation = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

// Buckets of the arrival wave: matches the data-wave delays in TileOverlay.module.css
export const WAVE_BUCKETS = 6;

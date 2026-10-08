export const getTileSelector = (tileUuid: string) =>
    `[data-tile-uuid="${tileUuid}"]`;

// The grid's draggableCancel class: a drag never starts on an overlay
export const LOCKED_TILE_CLASS = 'non-draggable';

// Marks an overlay root, so its tile's other content can be made inert
export const OVERLAY_ATTRIBUTE = 'data-controls-overlay';

// A mousedown inside an element with this attribute keeps the clicked field
export const KEEPS_FIELD_ATTRIBUTE = 'data-keeps-field';

// Buckets of the arrival wave: matches the data-wave delays in TileOverlay.module.css
export const WAVE_BUCKETS = 6;

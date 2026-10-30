export const getTileSelector = (tileUuid: string) =>
    `[data-tile-uuid="${tileUuid}"]`;

// The grid's draggableCancel class: a drag never starts on an overlay
export const LOCKED_TILE_CLASS = 'non-draggable';

// Marks an overlay root, so its tile's other content can be made inert
export const OVERLAY_ATTRIBUTE = 'data-controls-overlay';

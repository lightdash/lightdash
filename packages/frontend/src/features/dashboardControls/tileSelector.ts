export const getTileSelector = (tileUuid: string) =>
    `[data-tile-uuid="${tileUuid}"]`;

// The veil swallows pointer events so the grid does not drag or click through
export const stopPropagation = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

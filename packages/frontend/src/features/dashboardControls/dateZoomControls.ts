import {
    type DateZoomConfig,
    type DateZoomControl,
    type DateZoomTileTarget,
} from '@lightdash/common';

export const DATE_ZOOM_PILL_ATTRIBUTE = 'data-date-zoom-pill';
export const DATE_ZOOM_PILL_SELECTOR = `[${DATE_ZOOM_PILL_ATTRIBUTE}]`;
export const DATE_ZOOM_ADD_ATTRIBUTE = 'data-date-zoom-add';
export const DATE_ZOOM_ADD_SELECTOR = `[${DATE_ZOOM_ADD_ATTRIBUTE}]`;

export const DEFAULT_DATE_ZOOM_NAME = 'Date zoom';
// Apply's reason at no tiles, as a filter's
export const NO_TILES_REASON = 'This date zoom is not applied to any tiles';

export const getDateZoomControl = (
    config: DateZoomConfig,
    uuid: string,
): DateZoomControl | undefined =>
    config.controls.find((control) => control.uuid === uuid);

export const getZoomTileUuids = (
    config: DateZoomConfig,
    uuid: string,
): string[] =>
    Object.entries(config.tileTargets)
        .filter(([, target]) => target.controlUuid === uuid)
        .map(([tileUuid]) => tileUuid);

export const withDateZoomControl = (
    config: DateZoomConfig,
    control: DateZoomControl,
): DateZoomConfig => ({
    ...config,
    controls: config.controls.some(({ uuid }) => uuid === control.uuid)
        ? config.controls.map((item) =>
              item.uuid === control.uuid ? control : item,
          )
        : [...config.controls, control],
});
/** Sets (a target) or takes off (null) each tile for the zoom; a target takes the tile from any other zoom. */
export const setZoomTiles = (
    config: DateZoomConfig,
    uuid: string,
    changes: {
        tileUuid: string;
        target: Omit<DateZoomTileTarget, 'controlUuid'> | null;
    }[],
): DateZoomConfig => {
    const tileTargets = { ...config.tileTargets };
    let isChanged = false;
    changes.forEach(({ tileUuid, target }) => {
        const current = tileTargets[tileUuid];
        if (target === null) {
            if (current?.controlUuid !== uuid) return;
            delete tileTargets[tileUuid];
            isChanged = true;
            return;
        }
        if (
            current?.controlUuid === uuid &&
            current.fieldId === target.fieldId &&
            current.tableName === target.tableName
        )
            return;
        tileTargets[tileUuid] = { controlUuid: uuid, ...target };
        isChanged = true;
    });
    return isChanged ? { ...config, tileTargets } : config;
};

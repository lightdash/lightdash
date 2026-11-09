import { type DateZoomConfig, type DateZoomControl } from '@lightdash/common';

export const DATE_ZOOM_PILL_ATTRIBUTE = 'data-date-zoom-pill';
export const DATE_ZOOM_PILL_SELECTOR = `[${DATE_ZOOM_PILL_ATTRIBUTE}]`;
export const DATE_ZOOM_ADD_ATTRIBUTE = 'data-date-zoom-add';
export const DATE_ZOOM_ADD_SELECTOR = `[${DATE_ZOOM_ADD_ATTRIBUTE}]`;

export const DEFAULT_DATE_ZOOM_NAME = 'Date zoom';

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

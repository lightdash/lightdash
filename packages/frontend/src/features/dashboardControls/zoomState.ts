import {
    DateGranularity,
    type DateZoomConfig,
    type DateZoomControl,
    type DateZoomTileTarget,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';

// The name a new zoom starts with, and the one an emptied name goes back to
export const DEFAULT_ZOOM_NAME = 'Date zoom';

export type ZoomSnapshot = {
    dateZoomConfig: DateZoomConfig;
    hasDateZoomConfigChanged: boolean;
};

// A tile's field in a zoom; a param-only tile has none
export type ZoomTileField = Pick<DateZoomTileTarget, 'fieldId' | 'tableName'>;

export const createZoomControl = (
    uuid: string,
    defaultGranularity: DateGranularity | string | undefined,
    enabledGranularities: (DateGranularity | string)[],
): DateZoomControl => ({
    uuid,
    name: DEFAULT_ZOOM_NAME,
    granularity:
        defaultGranularity ?? enabledGranularities[0] ?? DateGranularity.MONTH,
});

export const findZoomControl = (
    config: DateZoomConfig,
    controlUuid: string,
): DateZoomControl | null =>
    config.controls.find((control) => control.uuid === controlUuid) ?? null;

export const getZoomTileUuids = (
    config: DateZoomConfig,
    controlUuid: string,
): string[] =>
    Object.entries(config.tileTargets)
        .filter(([, target]) => target.controlUuid === controlUuid)
        .map(([tileUuid]) => tileUuid);

export const addZoomControl = (
    config: DateZoomConfig,
    control: DateZoomControl,
): DateZoomConfig => ({ ...config, controls: [...config.controls, control] });

export const replaceZoomControl = (
    config: DateZoomConfig,
    next: DateZoomControl,
): DateZoomConfig => ({
    ...config,
    controls: config.controls.map((control) =>
        control.uuid === next.uuid ? next : control,
    ),
});

// The control goes with its tiles; other zooms keep theirs
export const removeZoomControl = (
    config: DateZoomConfig,
    controlUuid: string,
): DateZoomConfig => ({
    controls: config.controls.filter((control) => control.uuid !== controlUuid),
    tileTargets: Object.fromEntries(
        Object.entries(config.tileTargets).filter(
            ([, target]) => target.controlUuid !== controlUuid,
        ),
    ),
});

// One zoom per tile: a field puts the tile in this zoom (out of any other,
// which is a move), null takes it out of this zoom only
export const setZoomTileField = (
    config: DateZoomConfig,
    controlUuid: string,
    tileUuid: string,
    field: ZoomTileField | null,
): DateZoomConfig => {
    const { [tileUuid]: current, ...rest } = config.tileTargets;
    if (field === null) {
        return current?.controlUuid === controlUuid
            ? { ...config, tileTargets: rest }
            : config;
    }
    return {
        ...config,
        tileTargets: { ...rest, [tileUuid]: { controlUuid, ...field } },
    };
};

// Tiles already in a zoom, this one or another, are left as they are
export const addZoomTiles = (
    config: DateZoomConfig,
    controlUuid: string,
    tiles: { tileUuid: string; field: ZoomTileField }[],
): DateZoomConfig =>
    tiles
        .filter(({ tileUuid }) => config.tileTargets[tileUuid] === undefined)
        .reduce(
            (next, { tileUuid, field }) =>
                setZoomTileField(next, controlUuid, tileUuid, field),
            config,
        );

// The tiles the edit of this zoom could have changed: in it then or now
const getTouchedTileUuids = (
    current: DateZoomConfig,
    snapshot: DateZoomConfig,
    controlUuid: string,
): string[] => [
    ...new Set([
        ...getZoomTileUuids(snapshot, controlUuid),
        ...getZoomTileUuids(current, controlUuid),
    ]),
];

// Undoes the edit of one zoom: the control as the snapshot holds it (out when
// it was new) and its tiles, a tile moved from another zoom going back there.
// Everything else keeps what was written since
export const restoreZoom = (
    current: DateZoomConfig,
    snapshot: DateZoomConfig,
    controlUuid: string,
): DateZoomConfig => {
    const saved = findZoomControl(snapshot, controlUuid);
    const others = current.controls.filter(
        (control) => control.uuid !== controlUuid,
    );
    const controls =
        saved === null
            ? others
            : findZoomControl(current, controlUuid) !== null
              ? current.controls.map((control) =>
                    control.uuid === controlUuid ? saved : control,
                )
              : [
                    ...others.slice(0, snapshot.controls.indexOf(saved)),
                    saved,
                    ...others.slice(snapshot.controls.indexOf(saved)),
                ];
    const tileTargets = { ...current.tileTargets };
    getTouchedTileUuids(current, snapshot, controlUuid).forEach((tileUuid) => {
        const before = snapshot.tileTargets[tileUuid];
        if (before === undefined) delete tileTargets[tileUuid];
        else tileTargets[tileUuid] = before;
    });
    return { controls, tileTargets };
};

// Apply: an emptied name goes back to the one a new zoom starts with, and a
// zoom left with no tiles goes: the edited one, and any other the edit emptied
export const applyZoomEdit = (
    current: DateZoomConfig,
    snapshot: DateZoomConfig,
    controlUuid: string,
): DateZoomConfig => {
    const emptied = current.controls.filter(
        (control) =>
            getZoomTileUuids(current, control.uuid).length === 0 &&
            (control.uuid === controlUuid ||
                getZoomTileUuids(snapshot, control.uuid).length > 0),
    );
    const named = current.controls.map((control) =>
        control.uuid === controlUuid && control.name.trim() === ''
            ? { ...control, name: DEFAULT_ZOOM_NAME }
            : control,
    );
    return emptied.reduce(
        (next, control) => removeZoomControl(next, control.uuid),
        named.some((control, index) => control !== current.controls[index])
            ? { ...current, controls: named }
            : current,
    );
};

/** Discard would change something: the edit wrote to this zoom or its tiles. */
export const isZoomDirty = (
    current: DateZoomConfig,
    snapshot: DateZoomConfig,
    controlUuid: string,
): boolean => !isEqual(restoreZoom(current, snapshot, controlUuid), current);

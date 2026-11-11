import {
    type DashboardControlSection,
    type DateZoomConfig,
    type DateZoomControl,
} from '@lightdash/common';

/** What a date zoom pill's drag carries, so drops tell it from the others. */
export const DATE_ZOOM_DRAG = 'dateZoom';
const DATE_ZOOM_PILL_ATTRIBUTE = 'data-date-zoom-pill';
export const DATE_ZOOM_PILL_SELECTOR = `[${DATE_ZOOM_PILL_ATTRIBUTE}]`;
export const DATE_ZOOM_PILL_ACTION_SELECTOR = '[data-date-zoom-pill-action]';
export const dateZoomPillSelector = (uuid: string) =>
    `[${DATE_ZOOM_PILL_ATTRIBUTE}="${uuid}"]`;
/** A name that is gone falls back to this, as a new zoom's does. */
export const DEFAULT_DATE_ZOOM_NAME = 'Date zoom';

export type DateZoomTileTargets = DateZoomConfig['tileTargets'];

/** Its section, or null when it has none or it is gone (unsectioned). */
export const getZoomSectionId = (
    control: DateZoomControl,
    sections: DashboardControlSection[],
): string | null =>
    control.sectionId !== undefined &&
    sections.some(({ id }) => id === control.sectionId)
        ? control.sectionId
        : null;

export const withZoomSection = (
    control: DateZoomControl,
    sectionId: string | null,
): DateZoomControl => {
    const { sectionId: _previous, ...rest } = control;
    return sectionId === null ? rest : { ...rest, sectionId };
};

/** The tiles a zoom re-grains, in target order. */
export const getZoomTileUuids = (
    tileTargets: DateZoomTileTargets,
    controlUuid: string,
): string[] =>
    Object.entries(tileTargets)
        .filter(([, target]) => target.controlUuid === controlUuid)
        .map(([tileUuid]) => tileUuid);

/** The zoom moved into a section (null: out of its own), at once. */
export const setZoomSection = (
    config: DateZoomConfig,
    controlUuid: string,
    sectionId: string | null,
): DateZoomConfig => ({
    ...config,
    controls: config.controls.map((control) =>
        control.uuid === controlUuid
            ? withZoomSection(control, sectionId)
            : control,
    ),
});

/** The zoom and its tile targets gone; other zooms as they are. */
export const removeZoom = (
    config: DateZoomConfig,
    controlUuid: string,
): DateZoomConfig => ({
    controls: config.controls.filter(({ uuid }) => uuid !== controlUuid),
    tileTargets: Object.fromEntries(
        Object.entries(config.tileTargets).filter(
            ([, target]) => target.controlUuid !== controlUuid,
        ),
    ),
});

/** Other zooms that lost their last tile to the draft: Apply removes them. */
export const getEmptiedZooms = (
    controls: DateZoomControl[],
    draftUuid: string,
    before: DateZoomTileTargets,
    after: DateZoomTileTargets,
): DateZoomControl[] =>
    controls.filter(
        ({ uuid }) =>
            uuid !== draftUuid &&
            getZoomTileUuids(before, uuid).length > 0 &&
            getZoomTileUuids(after, uuid).length === 0,
    );

/**
 * What Apply writes: the draft added or updated (its section as the
 * dashboard has it), every tile target as mapping left them, and the zooms
 * it took the last tile from removed.
 */
export const applyZoomDraft = ({
    config,
    draft,
    snapshotTargets,
    draftTargets,
}: {
    config: DateZoomConfig;
    draft: DateZoomControl;
    snapshotTargets: DateZoomTileTargets;
    draftTargets: DateZoomTileTargets;
}): DateZoomConfig => {
    const emptied = new Set(
        getEmptiedZooms(
            config.controls,
            draft.uuid,
            snapshotTargets,
            draftTargets,
        ).map(({ uuid }) => uuid),
    );
    const existing = config.controls.find(({ uuid }) => uuid === draft.uuid);
    const controls = existing
        ? config.controls.map((control) =>
              control.uuid === draft.uuid
                  ? withZoomSection(draft, existing.sectionId ?? null)
                  : control,
          )
        : [...config.controls, draft];
    return {
        controls: controls.filter(({ uuid }) => !emptied.has(uuid)),
        tileTargets: draftTargets,
    };
};

import {
    type DashboardControlSection,
    type DateZoomConfig,
    type DateZoomControl,
    type DateZoomTileTarget,
} from '@lightdash/common';

/** What a date zoom pill's drag carries, so drops tell it from the others. */
export const DATE_ZOOM_DRAG = 'dateZoom';
const DATE_ZOOM_PILL_ATTRIBUTE = 'data-date-zoom-pill';
export const DATE_ZOOM_PILL_SELECTOR = `[${DATE_ZOOM_PILL_ATTRIBUTE}]`;
export const DATE_ZOOM_PILL_ACTION_SELECTOR = '[data-date-zoom-pill-action]';
export const dateZoomPillSelector = (uuid: string) =>
    `[${DATE_ZOOM_PILL_ATTRIBUTE}="${uuid}"]`;
/** The default zoom's id in the editor and on its pill: never a saved zoom's. */
export const DEFAULT_ZOOM_ID = 'default-zoom';
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
/** A tile's target for the zoom: a field to re-grain, or null for a tile that only reads the parameter. */
export type ZoomTileChange = {
    tileUuid: string;
    /** Null: the tile leaves the zoom. */
    target: Pick<DateZoomTileTarget, 'fieldId' | 'tableName'> | null;
};

/** The zoom set on (or taken off) each tile; a tile in another zoom moves. */
export const setZoomTiles = (
    targets: DateZoomTileTargets,
    controlUuid: string,
    changes: ZoomTileChange[],
): DateZoomTileTargets => {
    const next = { ...targets };
    changes.forEach(({ tileUuid, target }) => {
        if (target === null) {
            if (next[tileUuid]?.controlUuid === controlUuid)
                delete next[tileUuid];
        } else next[tileUuid] = { controlUuid, ...target };
    });
    return next;
};

/** A tile on the grid while a zoom's tiles are chosen. */
export type DateZoomTileCard =
    | { kind: 'none' }
    | {
          /** A date field to re-grain, or (`param`) only the reserved parameter. */
          kind: 'field' | 'param';
          /** Its zoomable fields, for `field`; empty for `param`. */
          fieldIds: string[];
          fieldLabels: string[];
          fieldTables: string[];
          /** Its field in this zoom; null for a `param` tile in it, undefined when not in it. */
          fieldId: string | null | undefined;
          /** Another zoom has it: Move asks first, and warns when it is that zoom's last tile. */
          takenBy: { name: string; isLast: boolean } | null;
      };

export type DateZoomMapping = {
    /** The draft's name, as its pill reads. */
    name: string;
    cardByTile: Record<string, DateZoomTileCard>;
    /** Tiles a zoom can take, on any tab. */
    takeableTileUuids: string[];
    /** Tiles in this zoom. */
    appliedTileUuids: string[];
};

/** What choosing a zoom's tiles shows, from the eligible tiles and the draft's targets */
export const getDateZoomMapping = ({
    draft,
    controls,
    targets,
    tileUuids,
    eligible,
}: {
    draft: DateZoomControl;
    controls: DateZoomControl[];
    targets: DateZoomTileTargets;
    /** Every tile on the dashboard. */
    tileUuids: string[];
    eligible: {
        tileUuid: string;
        fields: { fieldId: string; label: string; tableName: string }[];
        isParamOnly: boolean;
    }[];
}): DateZoomMapping => {
    const byTile = new Map(eligible.map((entry) => [entry.tileUuid, entry]));
    const cardOf = (tileUuid: string): DateZoomTileCard => {
        const entry = byTile.get(tileUuid);
        if (entry === undefined) return { kind: 'none' };
        const target = targets[tileUuid];
        const other =
            target !== undefined && target.controlUuid !== draft.uuid
                ? controls.find(({ uuid }) => uuid === target.controlUuid)
                : undefined;
        return {
            kind: entry.isParamOnly ? 'param' : 'field',
            fieldIds: entry.fields.map(({ fieldId }) => fieldId),
            fieldLabels: entry.fields.map(({ label }) => label),
            fieldTables: entry.fields.map(({ tableName }) => tableName),
            fieldId:
                target?.controlUuid === draft.uuid ? target.fieldId : undefined,
            takenBy:
                other === undefined
                    ? null
                    : {
                          name: other.name,
                          isLast:
                              getZoomTileUuids(targets, other.uuid).length ===
                              1,
                      },
        };
    };
    return {
        name: draft.name,
        cardByTile: Object.fromEntries(
            tileUuids.map((tileUuid) => [tileUuid, cardOf(tileUuid)]),
        ),
        takeableTileUuids: eligible.map(({ tileUuid }) => tileUuid),
        appliedTileUuids: getZoomTileUuids(targets, draft.uuid),
    };
};

/** Bulk add: each tile in no zoom on its first field, or with no field when it only reads the parameter */
export const getBulkZoomChanges = (
    mapping: DateZoomMapping,
    tileUuids: string[],
): ZoomTileChange[] =>
    tileUuids.flatMap((tileUuid): ZoomTileChange[] => {
        const card = mapping.cardByTile[tileUuid];
        if (
            card === undefined ||
            card.kind === 'none' ||
            card.takenBy !== null ||
            card.fieldId !== undefined
        )
            return [];
        if (card.kind === 'param')
            return [{ tileUuid, target: { fieldId: null, tableName: null } }];
        if (card.fieldIds.length === 0) return [];
        return [
            {
                tileUuid,
                target: {
                    fieldId: card.fieldIds[0],
                    tableName: card.fieldTables[0],
                },
            },
        ];
    });

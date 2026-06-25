import { type DateZoom } from '@lightdash/common';

export type AppliedTileDateZoomArgs = {
    tileUuid: string;
    tilesWithDateZoomApplied: Set<string> | undefined;
    dateZoom: DateZoom | undefined;
    dateDimension: { table: string; name: string } | undefined;
};

// Narrows the resolved tile zoom to what was actually applied: the backend only
// re-grains the targeted x-axis field when zoom took effect for this tile, so
// drop xAxisFieldId until the applied-state set confirms it.
//
// The drill-through range filter needs the field the backend actually
// truncated. Cartesian tiles carry it as xAxisFieldId; non-cartesian (table)
// tiles zoom the backend-picked date dimension, which the resolver can't name,
// so fall back to it here to keep the underlying-data drill working.
export const getAppliedTileDateZoom = ({
    tileUuid,
    tilesWithDateZoomApplied,
    dateZoom,
    dateDimension,
}: AppliedTileDateZoomArgs): DateZoom | undefined => {
    if (!dateZoom) return undefined;
    const xAxisFieldId =
        dateZoom.xAxisFieldId ??
        (dateDimension
            ? `${dateDimension.table}_${dateDimension.name}`
            : undefined);
    if (!xAxisFieldId) return dateZoom;
    return tilesWithDateZoomApplied?.has(tileUuid)
        ? { ...dateZoom, xAxisFieldId }
        : { granularity: dateZoom.granularity };
};

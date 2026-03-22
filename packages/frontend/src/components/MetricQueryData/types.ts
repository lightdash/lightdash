import {
    type DateZoom,
    type ItemsMap,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';

/**
 * Each tuple represents one top-N group as a field→value map.
 * For a single pivot dimension: [{ country: "US" }, { country: "CA" }]
 * For multi-pivot: [{ country: "US", channel: "Paid" }, { country: "CA", channel: "Organic" }]
 */
export type TopGroupTuple = Record<string, string | null>;

export type UnderlyingDataConfig = {
    item: ItemsMap[string] | undefined;
    value: ResultValue;
    fieldValues: Record<string, ResultValue>;
    dimensions?: string[];
    pivotReference?: PivotReference;
    dateZoom?: DateZoom;
    topGroupTuples?: TopGroupTuple[];
};

export type DrillDownConfig = {
    item: ItemsMap[string];
    fieldValues: Record<string, ResultValue>;
    pivotReference?: PivotReference;
    topGroupTuples?: TopGroupTuple[];
};

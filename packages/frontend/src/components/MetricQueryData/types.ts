import {
    type DateZoom,
    type ItemsMap,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';

export type UnderlyingDataConfig = {
    item: ItemsMap[string] | undefined;
    value: ResultValue;
    fieldValues: Record<string, ResultValue>;
    dimensions?: string[];
    pivotReference?: PivotReference;
    dateZoom?: DateZoom;
};

export type DrillDownConfig = {
    item: ItemsMap[string];
    fieldValues: Record<string, ResultValue>;
    pivotReference?: PivotReference;
};

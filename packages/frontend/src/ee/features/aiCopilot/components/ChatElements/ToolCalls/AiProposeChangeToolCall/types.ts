import type {
    ToolProposeChangeArgs,
    ToolProposeChangeReplaceStringOp,
} from '@lightdash/common';

export type TableChange = Extract<
    ToolProposeChangeArgs['change'],
    { entityType: 'table' }
>;

export type DimensionChange = Extract<
    ToolProposeChangeArgs['change'],
    { entityType: 'dimension' }
>;

export type MetricChange = Extract<
    ToolProposeChangeArgs['change'],
    { entityType: 'metric' }
>;

export type EntityChange = ToolProposeChangeArgs['change'];

export type ChangeValue = ToolProposeChangeArgs['change']['value'];

export type Operation = ToolProposeChangeReplaceStringOp; // extend as needed in the future;

export type UpdateTablePatch = Extract<
    TableChange['value'],
    { type: 'update' }
>['patch'];

export type UpdateDimensionPatch = Extract<
    DimensionChange['value'],
    { type: 'update' }
>['patch'];

export type UpdateMetricPatch = Extract<
    MetricChange['value'],
    { type: 'update' }
>['patch'];

export type CreateMetric = Extract<MetricChange['value'], { type: 'create' }>;

import {
    type DateZoom,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';

export type MetricQueryDataSource = {
    tableName: string;
    metricQuery: MetricQuery;
    parameters?: ParametersValuesMap;
};

export type UnderlyingDataConfig = {
    item: ItemsMap[string] | undefined;
    value: ResultValue;
    fieldValues: Record<string, ResultValue>;
    dimensions?: string[];
    pivotReference?: PivotReference;
    dateZoom?: DateZoom;
    source?: MetricQueryDataSource & { queryUuid: string };
};

export type DrillDownConfig = {
    item: ItemsMap[string];
    fieldValues: Record<string, ResultValue>;
    pivotReference?: PivotReference;
    source?: MetricQueryDataSource;
};

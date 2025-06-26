import type { SortByDirection, VizAggregationOptions } from '..';
import { type FieldType } from './field';

// TODO: move/refactor #212
export enum SemanticLayerFieldType {
    TIME = 'time',
    NUMBER = 'number',
    STRING = 'string',
    BOOLEAN = 'boolean',
}

// TODO: move/refactor #212
enum SemanticLayerTimeGranularity {
    NANOSECOND = 'NANOSECOND',
    MICROSECOND = 'MICROSECOND',
    MILLISECOND = 'MILLISECOND',
    SECOND = 'SECOND',
    MINUTE = 'MINUTE',
    HOUR = 'HOUR',
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    QUARTER = 'QUARTER',
    YEAR = 'YEAR',
}

// TODO: move/refactor #212 -- used elsewhere
export type SemanticLayerField = {
    name: string;
    label: string;
    type: SemanticLayerFieldType;
    kind: FieldType;
    description?: string;
    visible: boolean;
    aggType?: VizAggregationOptions; // TODO: currently not populated, we should get this on the backend
    availableGranularities: SemanticLayerTimeGranularity[];
    availableOperators: SemanticLayerFilter['operator'][];
};

// TODO: move/refactor #212
type SemanticLayerTimeDimension = SemanticLayerField & {
    granularity?: SemanticLayerTimeGranularity;
};

// TODO: move/refactor #212 -- used elsewhere
export type SemanticLayerSortBy = Pick<SemanticLayerField, 'name' | 'kind'> & {
    direction: SortByDirection;
};

// TODO: move/refactor #212
type SemanticLayerPivot = {
    on: string[];
    index: string[];
    values: string[];
};

// NOTE: this type got re-used in a lot of places that aren't striclty
// related to semantic layer -- we need to keep and rename it. #212
export type SemanticLayerQuery = {
    dimensions: Pick<SemanticLayerField, 'name'>[];
    timeDimensions: Pick<SemanticLayerTimeDimension, 'name' | 'granularity'>[];
    metrics: Pick<SemanticLayerField, 'name'>[];
    sortBy: SemanticLayerSortBy[];
    limit?: number;
    timezone?: string;
    pivot?: SemanticLayerPivot;
    filters: SemanticLayerFilter[];
    sql?: string;
    customMetrics?: (Pick<SemanticLayerField, 'name' | 'aggType'> & {
        baseDimension?: string;
    })[];
};

// Semantic Layer Filters #212 -- used in the semantic layer query
export enum SemanticLayerFilterBaseOperator {
    IS = 'IS',
    IS_NOT = 'IS_NOT',
}

export enum SemanticLayerFilterRelativeTimeValue {
    TODAY = 'TODAY',
    YESTERDAY = 'YESTERDAY',
    LAST_7_DAYS = 'LAST_7_DAYS',
    LAST_30_DAYS = 'LAST_30_DAYS',
}

export type SemanticLayerFilterBase = {
    uuid: string;
    fieldRef: string;
    fieldKind: FieldType; // This is mostly to help with frontend state and avoiding having to set all the fields in redux to be able to find the kind
    fieldType: SemanticLayerFieldType;
};

export type SemanticLayerStringFilter = SemanticLayerFilterBase & {
    fieldType: SemanticLayerFieldType.STRING;
    operator: SemanticLayerFilterBaseOperator;
    values: string[];
};

export type SemanticLayerExactTimeFilter = SemanticLayerFilterBase & {
    fieldType: SemanticLayerFieldType.TIME;
    operator: SemanticLayerFilterBaseOperator;
    values: { time: string };
};

export type SemanticLayerRelativeTimeFilter = SemanticLayerFilterBase & {
    fieldType: SemanticLayerFieldType.TIME;
    operator: SemanticLayerFilterBaseOperator;
    values: { relativeTime: SemanticLayerFilterRelativeTimeValue };
};

export type SemanticLayerTimeFilter =
    | SemanticLayerExactTimeFilter
    | SemanticLayerRelativeTimeFilter;

type SemanticLayerFilterTypes =
    | SemanticLayerStringFilter
    | SemanticLayerTimeFilter;

export type SemanticLayerFilter = SemanticLayerFilterTypes & {
    and?: SemanticLayerFilter[];
    or?: SemanticLayerFilter[];
};

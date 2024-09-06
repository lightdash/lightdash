import assertUnreachable from '../utils/assertUnreachable';
import { type FieldType } from './field';

export type SemanticLayerView = {
    name: string;
    label: string;
    description?: string;
    visible: boolean;
};

export enum SemanticLayerFieldType {
    TIME = 'time',
    NUMBER = 'number',
    STRING = 'string',
    BOOLEAN = 'boolean',
}

export enum SemanticLayerTimeGranularity {
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

export enum SemanticLayerSortByDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

// TODO: should we separate metric and dimension fields?
export type SemanticLayerField = {
    name: string;
    label: string;
    type: SemanticLayerFieldType;
    kind: FieldType;
    description?: string;
    visible: boolean;
    aggType?: string; // eg: count, sum
    availableGranularities: SemanticLayerTimeGranularity[];
    availableOperators: SemanticLayerStringFilterOperator[];
};

export type SemanticLayerTimeDimension = SemanticLayerField & {
    granularity?: SemanticLayerTimeGranularity;
};

export type SemanticLayerSortBy = Pick<SemanticLayerField, 'name' | 'kind'> & {
    direction: SemanticLayerSortByDirection;
};

export type SemanticLayerPivot = {
    on: { reference: string; type: string } | undefined;
    index: string[];
    values: string[];
};

export type SemanticLayerQuery = {
    dimensions: Pick<SemanticLayerField, 'name'>[];
    timeDimensions: Pick<SemanticLayerTimeDimension, 'name' | 'granularity'>[];
    metrics: Pick<SemanticLayerField, 'name'>[];
    sortBy: SemanticLayerSortBy[];
    limit?: number;
    timezone?: string;
    pivot?: SemanticLayerPivot;
    filters: SemanticLayerFilter[];
};

export type SemanticLayerResultRow = Record<
    string,
    string | number | boolean | null
>;

export interface SemanticLayerTransformer<
    ViewType,
    QueryType,
    DimensionsType,
    MetricsType,
    ResultsType,
    SqlType,
> {
    fieldsToSemanticLayerFields: (
        dimensions: DimensionsType,
        metrics: MetricsType,
    ) => SemanticLayerField[];
    viewsToSemanticLayerViews: (views: ViewType[]) => SemanticLayerView[];
    semanticLayerQueryToQuery: (query: SemanticLayerQuery) => QueryType;
    resultsToResultRows: (results: ResultsType) => SemanticLayerResultRow[];
    sqlToString: (sql: SqlType) => string;
    mapResultsKeys: (key: string, query: SemanticLayerQuery) => string;
}

export interface SemanticLayerClientInfo {
    name: string;
    features: {
        views: boolean;
    };
    config: {
        maxQueryLimit: number;
    };
}

export interface ApiSemanticLayerClientInfo {
    status: 'ok';
    results: SemanticLayerClientInfo;
}

export interface SemanticLayerClient {
    getClientInfo: () => SemanticLayerClientInfo;
    getViews: () => Promise<SemanticLayerView[]>;
    getFields: (
        viewName: string,
        selectedFields: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ) => Promise<SemanticLayerField[]>;
    streamResults: (
        projectUuid: string,
        query: SemanticLayerQuery,
        callback: (results: SemanticLayerResultRow[]) => void,
    ) => Promise<number>;
    getSql: (query: SemanticLayerQuery) => Promise<string>;
    getMaxQueryLimit: () => number;
}

export type SemanticLayerQueryPayload = {
    projectUuid: string;
    userUuid: string;
    query: SemanticLayerQuery;
    context: 'semanticViewer';
};

export enum SemanticLayerStringFilterOperator {
    IS = 'IS',
    IS_NOT = 'IS NOT',
}

export type SemanticLayerFilterBase = {
    uuid: string;
    field: string;
    fieldKind: FieldType; // This is mostly to help with frontend state and avoiding having to set all the fields in redux to be able to find the kind
    fieldType: SemanticLayerFieldType;
};

export type SemanticLayerStringFilter = SemanticLayerFilterBase & {
    operator: SemanticLayerStringFilterOperator;
    values: string[];
};

// TODO: right now we only support string filters, this type should be a union of all filter types
type SemanticLayerFilterTypes = SemanticLayerStringFilter;

export type SemanticLayerFilter = SemanticLayerFilterTypes & {
    and?: SemanticLayerFilter[];
    or?: SemanticLayerFilter[];
};

// Helper functions and constants

export const semanticLayerQueryJob = 'semanticLayer';

const SEMANTIC_LAYER_DEFAULT_QUERY_LIMIT = 500;

export const isSemanticLayerTimeDimension = (
    field: SemanticLayerField,
): field is SemanticLayerTimeDimension => 'granularity' in field;

export function getDefaultedLimit(
    maxQueryLimit: number,
    queryLimit?: number,
): number {
    return Math.min(
        queryLimit ?? SEMANTIC_LAYER_DEFAULT_QUERY_LIMIT,
        maxQueryLimit,
    );
}

export function getAvailableSemanticLayerFilterOperators(
    fieldType: SemanticLayerFieldType,
) {
    switch (fieldType) {
        case SemanticLayerFieldType.STRING:
            return [
                SemanticLayerStringFilterOperator.IS,
                SemanticLayerStringFilterOperator.IS_NOT,
            ];
        case SemanticLayerFieldType.NUMBER:
        case SemanticLayerFieldType.BOOLEAN:
        case SemanticLayerFieldType.TIME:
            return [];
        default:
            return assertUnreachable(
                fieldType,
                `Unsupported field type: ${fieldType}`,
            );
    }
}

export function getFilterFieldNamesRecursively(filter: SemanticLayerFilter): {
    field: string;
    fieldKind: FieldType;
    fieldType: SemanticLayerFieldType;
}[] {
    const andFiltersFieldNames =
        filter.and?.flatMap(getFilterFieldNamesRecursively) ?? [];
    const orFiltersFieldNames =
        filter.or?.flatMap(getFilterFieldNamesRecursively) ?? [];

    return [
        {
            field: filter.field,
            fieldKind: filter.fieldKind,
            fieldType: filter.fieldType,
        },
        ...andFiltersFieldNames,
        ...orFiltersFieldNames,
    ];
}

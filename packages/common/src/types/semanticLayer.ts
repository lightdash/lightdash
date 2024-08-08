import { type FieldType } from './field';

export type SemanticLayerView = {
    name: string;
    label: string;
    description?: string;
    visible?: boolean;
};
export type SemanticLayerField = {
    name: string;
    label: string;
    type: string;
    fieldType: FieldType;
    description?: string;
    visible?: boolean;
    aggType?: string; // eg: count, sum
};

export type SemanticLayerQuery = {
    dimensions: string[];
    metrics: string[];
};

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
    resultsToResultRows: (results: ResultsType) => Record<string, any>[];
    sqlToString: (sql: SqlType) => string;
}

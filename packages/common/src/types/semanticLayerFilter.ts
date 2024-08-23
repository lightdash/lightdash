export enum SemanticLayerStringFilterOperator {
    IS = 'IS',
    IS_NOT = 'IS NOT',
}

export type SemanticLayerFilterBase = {
    field: string;
};

export type SemanticLayerStringFilter = SemanticLayerFilterBase & {
    operator: SemanticLayerStringFilterOperator;
    values: string[];
};

// TODO: right now we only support string filters
export type SemanticLayerFilter = SemanticLayerStringFilter;

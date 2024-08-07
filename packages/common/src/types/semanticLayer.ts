import { type FieldType } from './field';

export type SemanticLayerView = {
    name: string;
    label: string;
    description?: string;
    visible?: boolean;
};
// TODO split into dimension and metric ?
export type SemanticLayerField = {
    name: string;
    label: string;
    type: string;
    fieldType: FieldType;
    description?: string;
    visible?: boolean;
    aggType?: string; // eg: count, sum
};

import type { FunctionDefinition } from '@lightdash/formula';

export type FunctionCategory = FunctionDefinition['category'];

export const CATEGORY_LABELS: Record<FunctionCategory, string> = {
    aggregate: 'Aggregate',
    logical: 'Logic',
    math: 'Math',
    string: 'Text',
    date: 'Date',
    window: 'Window',
    null: 'Null handling',
    type: 'Type',
};

export const CATEGORY_ORDER: FunctionCategory[] = [
    'aggregate',
    'logical',
    'math',
    'string',
    'date',
    'window',
    'null',
    'type',
];

import type { FunctionDefinition } from '@lightdash/formula';
import i18n from '../../../../i18n/i18n';

export type FunctionCategory = FunctionDefinition['category'];

export const getCategoryLabels = (): Record<FunctionCategory, string> => ({
    aggregate: i18n.t('formula.categories.aggregate', {
        ns: 'tableCalculation',
    }),
    logical: i18n.t('formula.categories.logical', { ns: 'tableCalculation' }),
    math: i18n.t('formula.categories.math', { ns: 'tableCalculation' }),
    string: i18n.t('formula.categories.string', { ns: 'tableCalculation' }),
    date: i18n.t('formula.categories.date', { ns: 'tableCalculation' }),
    window: i18n.t('formula.categories.window', { ns: 'tableCalculation' }),
    null: i18n.t('formula.categories.null', { ns: 'tableCalculation' }),
    type: i18n.t('formula.categories.type', { ns: 'tableCalculation' }),
});

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

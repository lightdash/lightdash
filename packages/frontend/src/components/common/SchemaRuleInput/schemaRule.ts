import { isValidSchemaPattern } from '@lightdash/common';

export type SchemaPatternSelection = {
    database: string;
    patterns: string[];
};

export const isValidSchemaSelection = (
    selection: SchemaPatternSelection,
): boolean =>
    /^[A-Za-z_][A-Za-z0-9_$]*$/.test(selection.database) &&
    selection.patterns.every(isValidSchemaPattern);

export type SchemaRulePreviewText = {
    matched: string;
    unmatched: string;
    first: 'matched' | 'unmatched';
    emptyWarning: string | null;
};

export const aiRolePreviewText: SchemaRulePreviewText = {
    matched: 'excluded',
    unmatched: 'allowed',
    first: 'unmatched',
    emptyWarning: 'This AI role can read all schemas in the database.',
};

export const maskingPreviewText: SchemaRulePreviewText = {
    matched: 'matched',
    unmatched: 'not matched',
    first: 'matched',
    emptyWarning: null,
};

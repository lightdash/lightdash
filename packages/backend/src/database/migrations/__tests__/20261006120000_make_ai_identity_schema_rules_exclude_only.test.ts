import { describe, expect, it } from 'vitest';
import {
    down,
    normalizeStoredSchemaRule,
} from '../20261006120000_make_ai_identity_schema_rules_exclude_only';

describe('exclude-only schema rule migration', () => {
    it.each<{
        name: string;
        rule: Parameters<typeof normalizeStoredSchemaRule>[0];
        schemas: string[];
        expected: { database: string; excludePatterns: string[] };
    }>([
        {
            name: 'all_except',
            rule: {
                mode: 'all_except',
                database: 'RULE_DB',
                patterns: ['PII_*'],
            },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'RULE_DB', excludePatterns: ['PII_*'] },
        },
        {
            name: 'list',
            rule: { mode: 'list', schemas: ['LIST_DB.PUBLIC'] },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'LIST_DB', excludePatterns: ['*'] },
        },
        {
            name: 'only_matching',
            rule: {
                mode: 'only_matching',
                database: 'RULE_DB',
                patterns: ['PUBLIC'],
            },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'COLUMN_DB', excludePatterns: ['*'] },
        },
        {
            name: 'existing_role',
            rule: { mode: 'existing_role' },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'COLUMN_DB', excludePatterns: ['*'] },
        },
        {
            name: 'empty list',
            rule: { mode: 'list', schemas: [] },
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'only_matching without stored schemas',
            rule: {
                mode: 'only_matching',
                database: 'RULE_DB',
                patterns: ['PUBLIC'],
            },
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'existing_role without stored schemas',
            rule: { mode: 'existing_role' },
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'null rule',
            rule: null,
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'COLUMN_DB', excludePatterns: ['*'] },
        },
        {
            name: 'null rule without stored schemas',
            rule: null,
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'current rule',
            rule: { database: 'DB', excludePatterns: [] },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'DB', excludePatterns: [] },
        },
    ])('transforms $name', ({ rule, schemas, expected }) => {
        expect(normalizeStoredSchemaRule(rule, schemas)).toEqual(expected);
    });
    it('reports that the old modes cannot be restored', async () => {
        await expect(down()).rejects.toThrow('irreversible:');
    });
});

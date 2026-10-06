import { describe, expect, it } from 'vitest';
import { AiIdentitySchemaRuleMode } from '../types/aiIdentitySchemaRule';
import {
    expandAiIdentitySchemaRule,
    isValidSchemaPattern,
    matchesSchemaPattern,
} from './aiIdentitySchemaRule';

const catalog = [
    'ANALYTICS_DB.SALES',
    'ANALYTICS_DB.HR_RESTRICTED',
    'ANALYTICS_DB.EVENTS_RAW',
    'ANALYTICS_DB.PII_PEOPLE',
    'ANALYTICS_DB.INFORMATION_SCHEMA',
    'OTHER_DB.SALES',
];

describe('matchesSchemaPattern', () => {
    it.each([
        ['HR_RESTRICTED', '*_RESTRICTED', true],
        ['HR_RESTRICTED_V2', '*_RESTRICTED', false],
        ['PII_PEOPLE', 'PII_*', true],
        ['EVENTS_RAW', '*_RAW', true],
        ['EVENTS_RAW', 'EVENTS_RA?', true],
        ['SALES', 'SALES', true],
        ['SALES2', 'SALES', false],
        ['hr_restricted', '*_RESTRICTED', true],
        ['HR_RESTRICTED', '*_restricted', true],
        ['MY$SCHEMA', 'MY$*', true],
    ])('%s with %s is %s', (schema, pattern, expected) => {
        expect(matchesSchemaPattern(schema, [pattern])).toBe(expected);
    });

    it('matches when any of several patterns match', () => {
        expect(
            matchesSchemaPattern('EVENTS_RAW', ['*_RESTRICTED', '*_RAW']),
        ).toBe(true);
        expect(matchesSchemaPattern('SALES', ['*_RESTRICTED', '*_RAW'])).toBe(
            false,
        );
    });

    it('treats regex characters as plain text', () => {
        expect(isValidSchemaPattern('.*')).toBe(false);
        expect(isValidSchemaPattern('A|B')).toBe(false);
        expect(() => matchesSchemaPattern('SALES', ['(SALES)'])).toThrow(
            'Invalid schema pattern',
        );
    });
});

describe('expandAiIdentitySchemaRule', () => {
    it('allows every schema in the database except the matching names', () => {
        expect(
            expandAiIdentitySchemaRule(
                {
                    mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                    database: 'ANALYTICS_DB',
                    patterns: ['*_RESTRICTED', 'PII_*'],
                },
                catalog,
            ),
        ).toEqual({
            allowed: ['ANALYTICS_DB.EVENTS_RAW', 'ANALYTICS_DB.SALES'],
            excluded: ['ANALYTICS_DB.HR_RESTRICTED', 'ANALYTICS_DB.PII_PEOPLE'],
        });
    });

    it('allows only the matching names in include mode', () => {
        expect(
            expandAiIdentitySchemaRule(
                {
                    mode: AiIdentitySchemaRuleMode.ONLY_MATCHING,
                    database: 'analytics_db',
                    patterns: ['sales', '*_raw'],
                },
                catalog,
            ),
        ).toEqual({
            allowed: ['ANALYTICS_DB.EVENTS_RAW', 'ANALYTICS_DB.SALES'],
            excluded: ['ANALYTICS_DB.HR_RESTRICTED', 'ANALYTICS_DB.PII_PEOPLE'],
        });
    });

    it('allows everything when no name matches an exclusion', () => {
        const result = expandAiIdentitySchemaRule(
            {
                mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                database: 'ANALYTICS_DB',
                patterns: ['*_SECRET'],
            },
            catalog,
        );
        expect(result.allowed).toHaveLength(4);
        expect(result.excluded).toEqual([]);
    });

    it('allows nothing when no name matches in include mode', () => {
        expect(
            expandAiIdentitySchemaRule(
                {
                    mode: AiIdentitySchemaRuleMode.ONLY_MATCHING,
                    database: 'ANALYTICS_DB',
                    patterns: ['*_SAFE'],
                },
                catalog,
            ).allowed,
        ).toEqual([]);
    });

    it('ignores other databases and INFORMATION_SCHEMA', () => {
        const { allowed, excluded } = expandAiIdentitySchemaRule(
            {
                mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                database: 'ANALYTICS_DB',
                patterns: [],
            },
            catalog,
        );
        expect([...allowed, ...excluded]).not.toContain('OTHER_DB.SALES');
        expect([...allowed, ...excluded]).not.toContain(
            'ANALYTICS_DB.INFORMATION_SCHEMA',
        );
    });

    it('keeps an explicit list as it is and grants nothing for an existing role', () => {
        expect(
            expandAiIdentitySchemaRule(
                {
                    mode: AiIdentitySchemaRuleMode.LIST,
                    schemas: ['ANALYTICS_DB.SALES', 'analytics_db.sales'],
                },
                catalog,
            ),
        ).toEqual({ allowed: ['analytics_db.sales'], excluded: [] });
        expect(
            expandAiIdentitySchemaRule(
                { mode: AiIdentitySchemaRuleMode.EXISTING_ROLE },
                catalog,
            ),
        ).toEqual({ allowed: [], excluded: [] });
    });

    it('rejects an invalid pattern', () => {
        expect(() =>
            expandAiIdentitySchemaRule(
                {
                    mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                    database: 'ANALYTICS_DB',
                    patterns: ['HR CLEAR'],
                },
                catalog,
            ),
        ).toThrow('Invalid schema pattern');
    });

    it('expands a large catalog quickly', () => {
        const big = Array.from(
            { length: 1500 },
            (_, index) =>
                `ANALYTICS_DB.SCHEMA_${index}${index % 10 === 0 ? '_RESTRICTED' : ''}`,
        );
        const started = Date.now();
        const result = expandAiIdentitySchemaRule(
            {
                mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                database: 'ANALYTICS_DB',
                patterns: ['*_RESTRICTED'],
            },
            big,
        );
        expect(result.allowed).toHaveLength(1350);
        expect(result.excluded).toHaveLength(150);
        expect(Date.now() - started).toBeLessThan(500);
    });
});

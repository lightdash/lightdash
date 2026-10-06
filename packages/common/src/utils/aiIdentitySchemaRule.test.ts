import { describe, expect, it } from 'vitest';
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
    'ANALYTICS_DB.BAD-NAME',
    'ANALYTICS_DB.1INVALID',
    'ANALYTICS_DB.EXTRA.DOT',
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
                    database: 'ANALYTICS_DB',
                    excludePatterns: ['*_RESTRICTED', 'PII_*'],
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
                database: 'ANALYTICS_DB',
                excludePatterns: ['*_SECRET'],
            },
            catalog,
        );
        expect(result.allowed).toHaveLength(4);
        expect(result.excluded).toEqual([]);
    });

    it('allows all safe schemas with no exclusions', () => {
        const { allowed, excluded } = expandAiIdentitySchemaRule(
            {
                database: 'ANALYTICS_DB',
                excludePatterns: [],
            },
            catalog,
        );
        expect(allowed).toHaveLength(4);
        expect(excluded).toEqual([]);
        expect([...allowed, ...excluded]).not.toContain('OTHER_DB.SALES');
        expect([...allowed, ...excluded]).not.toContain(
            'ANALYTICS_DB.INFORMATION_SCHEMA',
        );
    });

    it('rejects an invalid pattern', () => {
        expect(() =>
            expandAiIdentitySchemaRule(
                {
                    database: 'ANALYTICS_DB',
                    excludePatterns: ['HR RESTRICTED'],
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
                database: 'ANALYTICS_DB',
                excludePatterns: ['*_RESTRICTED'],
            },
            big,
        );
        expect(result.allowed).toHaveLength(1350);
        expect(result.excluded).toHaveLength(150);
        expect(Date.now() - started).toBeLessThan(500);
    });
});

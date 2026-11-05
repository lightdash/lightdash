import { describe, expect, it } from 'vitest';
import {
    formatIdentifier,
    getCatalogScopeSuggestions,
    parseQualifiedPrefix,
    type SqlCatalog,
} from './sqlCompletionScope';

const catalog: SqlCatalog = {
    database: 'my-project',
    tablesBySchema: [
        { schema: 'silver', tables: { orders: {}, customers: {} } },
        { schema: 'silver_archive', tables: { orders_2020: {} } },
        { schema: 'gold', tables: { revenue: {} } },
    ],
};

describe('parseQualifiedPrefix', () => {
    it('returns no qualifiers for a bare word', () => {
        expect(parseQualifiedPrefix('select * from sil', '`')).toEqual({
            chainStart: 14,
            qualifiers: [],
            partial: 'sil',
            partialStart: 14,
            openQuoteStart: null,
            isQuotedPath: false,
        });
    });

    it('parses an unquoted qualifier', () => {
        expect(parseQualifiedPrefix('select * from silver.', '`')).toEqual({
            chainStart: 14,
            qualifiers: ['silver'],
            partial: '',
            partialStart: 21,
            openQuoteStart: null,
            isQuotedPath: false,
        });
        expect(parseQualifiedPrefix('from silver.or', '`').qualifiers).toEqual([
            'silver',
        ]);
    });

    it('parses quoted qualifiers and project names with hyphens', () => {
        expect(
            parseQualifiedPrefix('from `my-project`.`silver`.', '`').qualifiers,
        ).toEqual(['my-project', 'silver']);
        expect(
            parseQualifiedPrefix('from `my-project.silver`.', '`').qualifiers,
        ).toEqual(['my-project', 'silver']);
    });

    it('parses a path inside one open backtick quote', () => {
        expect(parseQualifiedPrefix('from `silver.or', '`')).toEqual({
            chainStart: 5,
            qualifiers: ['silver'],
            partial: 'or',
            partialStart: 13,
            openQuoteStart: 5,
            isQuotedPath: true,
        });
    });

    it('parses an open quote after a qualifier', () => {
        expect(parseQualifiedPrefix('from "silver"."or', '"')).toEqual({
            chainStart: 5,
            qualifiers: ['silver'],
            partial: 'or',
            partialStart: 15,
            openQuoteStart: 14,
            isQuotedPath: false,
        });
    });

    it('does not split dots inside double quotes', () => {
        expect(parseQualifiedPrefix('from "a.b".', '"').qualifiers).toEqual([
            'a.b',
        ]);
    });

    it('treats a closed quote as no prefix', () => {
        expect(parseQualifiedPrefix('from `silver`', '`')).toEqual({
            chainStart: 13,
            qualifiers: [],
            partial: '',
            partialStart: 13,
            openQuoteStart: null,
            isQuotedPath: false,
        });
    });

    it('ignores closed quoted identifiers earlier on the line', () => {
        expect(
            parseQualifiedPrefix('FROM jaffle."orders" o WHERE o.st', '"'),
        ).toMatchObject({
            qualifiers: ['o'],
            partial: 'st',
            openQuoteStart: null,
        });
        expect(
            parseQualifiedPrefix('FROM `p.ds.orders` o WHERE o.', '`'),
        ).toMatchObject({
            qualifiers: ['o'],
            partial: '',
            openQuoteStart: null,
        });
        expect(
            parseQualifiedPrefix('FROM `p.ds.orders` o JOIN `ds.cu', '`'),
        ).toMatchObject({
            qualifiers: ['ds'],
            partial: 'cu',
            openQuoteStart: 26,
        });
    });

    it('ignores numbers', () => {
        expect(parseQualifiedPrefix('select 1.', '`').qualifiers).toEqual([]);
    });
});

describe('getCatalogScopeSuggestions', () => {
    it('scopes a schema in the default database to its tables', () => {
        expect(getCatalogScopeSuggestions(catalog, ['silver'])).toEqual({
            schemas: [],
            tables: ['orders', 'customers'],
        });
    });

    it('matches schemas case-insensitively', () => {
        expect(getCatalogScopeSuggestions(catalog, ['SILVER'])?.tables).toEqual(
            ['orders', 'customers'],
        );
    });

    it('lists schemas for the default database', () => {
        expect(getCatalogScopeSuggestions(catalog, ['my-project'])).toEqual({
            schemas: ['silver', 'silver_archive', 'gold'],
            tables: [],
        });
    });

    it('scopes database.schema to its tables', () => {
        expect(
            getCatalogScopeSuggestions(catalog, ['my-project', 'gold']),
        ).toEqual({ schemas: [], tables: ['revenue'] });
    });

    it('returns null for qualifiers outside the catalog', () => {
        expect(getCatalogScopeSuggestions(catalog, [])).toBeNull();
        expect(getCatalogScopeSuggestions(catalog, ['o'])).toBeNull();
        expect(
            getCatalogScopeSuggestions(catalog, ['other-project', 'silver']),
        ).toBeNull();
        expect(
            getCatalogScopeSuggestions(catalog, ['silver', 'orders']),
        ).toBeNull();
        expect(getCatalogScopeSuggestions(undefined, ['silver'])).toBeNull();
    });
});

describe('formatIdentifier', () => {
    it('quotes by default', () => {
        expect(formatIdentifier('orders', '`', undefined)).toBe('`orders`');
    });

    it('applies case and quote preferences', () => {
        expect(
            formatIdentifier('orders', '"', {
                quotePreference: 'never',
                casePreference: 'uppercase',
                qualification: 'full',
            }),
        ).toBe('ORDERS');
    });
});

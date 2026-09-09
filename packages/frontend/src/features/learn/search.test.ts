import { describe, expect, it } from 'vitest';
import { buildLearnCatalogue } from './catalogue';
import { createLearnSearch } from './search';

const catalogue = buildLearnCatalogue();
const search = createLearnSearch(catalogue);

describe('Learn search', () => {
    it.each([
        ['change from day to month', 'view:Dashboard'],
        ['How do I change from day to month?', 'view:Dashboard'],
        ['date zoom', 'view:Dashboard'],
        ['date granularity', 'view:Dashboard'],
        ['Custom Dimensions', 'manage:CustomFields'],
        ['export to csv', 'manage:ExportCsv'],
        ['custom dimenson', 'manage:CustomFields'],
        ['create a dashboard', 'manage:Dashboard'],
        ['manage:CustomFields', 'manage:CustomFields'],
    ])('ranks %s with the relevant walkthrough first', (query, scope) => {
        expect(search(query)[0]?.scope).toBe(scope);
    });

    it.each(['', '   ', '?!', 'how do I'])(
        'preserves browse order for %j',
        (query) => {
            expect(search(query)).toEqual(catalogue);
        },
    );

    it('requires every meaningful word to match', () => {
        expect(search('dashboard unicorn')).toEqual([]);
    });

    it('does not search link destinations or tour selectors', () => {
        expect(search('https')).toEqual([]);
        expect(search('data-tour-anchor')).toEqual([]);
    });

    it('only returns modules supplied to the index', () => {
        const restricted = createLearnSearch(
            catalogue.filter((module) => module.scope !== 'view:Dashboard'),
        );
        expect(restricted('change from day to month')).toEqual([]);
    });

    it('still searches modules without a walkthrough', () => {
        const comingSoon = catalogue.find((module) => !module.available)!;
        expect(search(comingSoon.title)).toContainEqual(comingSoon);
    });
});

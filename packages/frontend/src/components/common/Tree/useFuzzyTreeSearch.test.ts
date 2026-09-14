import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type NestableItem } from './types';
import useFuzzyTreeSearch from './useFuzzyTreeSearch';

const items: NestableItem[] = [
    { uuid: '1', name: 'Finance', path: 'finance' },
    { uuid: '2', name: 'Reports', path: 'finance.reports' },
    { uuid: '3', name: 'Marketing weekly', path: 'finance.reports.weekly' },
    { uuid: '4', name: 'Archive', path: 'finance.archive' },
    { uuid: '5', name: 'Marketing', path: 'marketing' },
    { uuid: '6', name: 'Drafts', path: 'marketing.drafts' },
    // Path shares a string prefix with "marketing" but is not its descendant
    { uuid: '7', name: 'Marketing ops', path: 'marketingops' },
    { uuid: '8', name: 'Old', path: 'marketingops.old', restricted: true },
];

const search = (query: string) =>
    renderHook(() => useFuzzyTreeSearch(items, query)).result.current;

describe('useFuzzyTreeSearch', () => {
    it('returns undefined when there is no query', () => {
        expect(search('')).toBeUndefined();
    });

    it('keeps matches and their ancestors, in the original order', () => {
        const result = search('marketing');

        expect(
            result?.map((item) => [item.path, item._fuzzyFilteredBy]),
        ).toEqual([
            ['finance', 'parent'],
            ['finance.reports', 'parent'],
            ['finance.reports.weekly', 'match'],
            ['marketing', 'match'],
            ['marketingops', 'match'],
        ]);
    });

    it('does not treat a string-prefix sibling as an ancestor', () => {
        const result = search('Old');

        expect(result?.map((item) => item.path)).toEqual([
            'marketingops',
            'marketingops.old',
        ]);
    });

    it('preserves item fields and adds highlight matches', () => {
        const result = search('Old');
        const match = result?.find((item) => item.path === 'marketingops.old');

        expect(match).toMatchObject({
            uuid: '8',
            restricted: true,
            _fuzzyFilteredBy: 'match',
        });
        expect(
            match && '_fuzzyMatches' in match && match._fuzzyMatches,
        ).toEqual(['Old']);
    });

    it('drops spaces that neither match nor lead to a match', () => {
        const result = search('Drafts');

        expect(result?.map((item) => item.path)).toEqual([
            'marketing',
            'marketing.drafts',
        ]);
    });
});

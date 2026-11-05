import { type DashboardParameterControl } from '@lightdash/common';
import {
    getParameterControlsWithIds,
    getParameterControlsWithSlugs,
} from './parameterControlSlugs';

const control = (
    id: string,
    label: string | null,
): DashboardParameterControl => ({
    id,
    label,
    value: 'EU',
    valueType: { type: 'string', multiple: false },
    parameters: { 'orders.region': 'all' },
});

describe('portable parameter controls', () => {
    it('downloads readable unique slugs and restores saved ids on upload', () => {
        const existing = [
            control('a', 'Region'),
            control('b', 'Region'),
            control('c', 'Region 1'),
        ];
        const portable = getParameterControlsWithSlugs(existing);
        expect(portable.map((item) => item.slug)).toEqual([
            'region-2',
            'region-3',
            'region-1',
        ]);
        expect(portable.every((item) => item.id === undefined)).toBe(true);
        expect(
            getParameterControlsWithIds(portable, existing).map(
                (item) => item.id,
            ),
        ).toEqual(['a', 'b', 'c']);
    });

    it('accepts legacy ids and mints an id for a new control', () => {
        const [legacy, fresh] = getParameterControlsWithIds(
            [
                control('legacy', null),
                { ...control('unused', 'New'), id: undefined, slug: 'new' },
            ],
            [],
        );
        expect(legacy.id).toBe('legacy');
        expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('handles empty lists and falls back to the first parameter key', () => {
        expect(getParameterControlsWithSlugs([])).toEqual([]);
        expect(getParameterControlsWithIds([], [])).toEqual([]);
        expect(
            getParameterControlsWithSlugs([control('a', null)])[0].slug,
        ).toBe('orders-region');
    });

    it('preserves a portable slug and id through successive label edits', () => {
        const existing = [control('saved-id', 'Initial')];
        const upload = {
            ...control('ignored', 'First edit'),
            id: undefined,
            slug: 'initial',
        };
        const first = getParameterControlsWithIds([upload], existing);
        const second = getParameterControlsWithIds(
            [{ ...upload, label: 'Second edit' }],
            first,
        );
        expect(second[0]).toMatchObject({
            id: 'saved-id',
            slug: 'initial',
            label: 'Second edit',
        });
        expect(getParameterControlsWithSlugs(second)[0].slug).toBe('initial');
    });

    it('allows labels to be swapped without changing control identity', () => {
        const existing = [control('a', 'Alpha'), control('b', 'Beta')];
        const portable = getParameterControlsWithSlugs(existing);
        const swapped = [
            { ...portable[0], label: 'Beta' },
            { ...portable[1], label: 'Alpha' },
        ];
        expect(getParameterControlsWithIds(swapped, existing)).toMatchObject([
            { id: 'a', slug: 'alpha', label: 'Beta' },
            { id: 'b', slug: 'beta', label: 'Alpha' },
        ]);
    });

    it('reserves stored slugs before deriving names for controls', () => {
        const items = [
            { ...control('a', 'West'), slug: 'region' },
            control('b', 'Region'),
        ];
        expect(
            getParameterControlsWithSlugs(items).map((item) => item.slug),
        ).toEqual(['region', 'region-1']);
    });

    it('rejects duplicate slugs and duplicate ids', () => {
        const item = { ...control('a', 'Region'), slug: 'region' };
        expect(() =>
            getParameterControlsWithIds([item, { ...item, id: 'b' }], []),
        ).toThrow('slug "region" is duplicated');
        expect(() =>
            getParameterControlsWithIds([item, { ...item, slug: 'other' }], []),
        ).toThrow('id "a" is duplicated');
    });

    it('retains a renamed control on repeated upload', () => {
        const edited = {
            ...control('unused', 'New label'),
            id: undefined,
            slug: 'old-label',
        };
        const first = getParameterControlsWithIds(
            [edited],
            [control('old-id', 'Old label')],
        );
        expect(first[0].id).toBe('old-id');
        expect(getParameterControlsWithIds([edited], first)[0].id).toBe(
            'old-id',
        );
    });
});

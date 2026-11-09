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
    it('downloads readable unique slugs and keeps only ids with a unique label', () => {
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
        const ids = getParameterControlsWithIds(portable, existing).map(
            (item) => item.id,
        );
        expect(ids[2]).toBe('c');
        expect(ids[0]).not.toMatch(/^[abc]$/);
        expect(ids[1]).not.toMatch(/^[abc]$/);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('mints new ids when the upload duplicates a label that is unique in the saved controls', () => {
        const ids = getParameterControlsWithIds(
            getParameterControlsWithSlugs([
                control('x', 'Region'),
                control('y', 'Region'),
            ]),
            [control('a', 'Region')],
        ).map((item) => item.id);
        expect(ids).not.toContain('a');
        expect(new Set(ids).size).toBe(2);
    });

    it('mints a new id when the saved controls duplicate a label that is unique in the upload', () => {
        const [uploaded] = getParameterControlsWithIds(
            getParameterControlsWithSlugs([control('x', 'Region')]),
            [control('a', 'Region'), control('b', 'Region')],
        );
        expect(uploaded.id).not.toMatch(/^[ab]$/);
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

    it('mints a new id for a relabelled control, whatever slug the file keeps', () => {
        const existing = [control('saved-id', 'Initial')];
        const [relabelled] = getParameterControlsWithIds(
            [
                {
                    ...control('ignored', 'First edit'),
                    id: undefined,
                    slug: 'initial',
                },
            ],
            existing,
        );
        expect(relabelled.id).not.toBe('saved-id');
        expect(relabelled).not.toHaveProperty('slug');
    });

    it('keeps ids by label when the file swaps slugs', () => {
        const existing = [control('a', 'Alpha'), control('b', 'Beta')];
        const portable = getParameterControlsWithSlugs(existing);
        const swapped = [
            { ...portable[0], slug: 'beta' },
            { ...portable[1], slug: 'alpha' },
        ];
        expect(
            getParameterControlsWithIds(swapped, existing).map(({ id }) => id),
        ).toEqual(['a', 'b']);
    });

    it('ignores a stored slug on download', () => {
        const items = [
            { ...control('a', 'West'), slug: 'region' },
            control('b', 'Region'),
        ];
        expect(
            getParameterControlsWithSlugs(items).map((item) => item.slug),
        ).toEqual(['west', 'region']);
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

    it('keeps the id of an unchanged control on repeated upload', () => {
        const first = getParameterControlsWithIds(
            getParameterControlsWithSlugs([control('old-id', 'Old label')]),
            [control('old-id', 'Old label')],
        );
        expect(first[0].id).toBe('old-id');
        expect(
            getParameterControlsWithIds(
                getParameterControlsWithSlugs(first),
                first,
            )[0].id,
        ).toBe('old-id');
    });
});

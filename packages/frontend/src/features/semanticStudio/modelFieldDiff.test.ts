import { type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    describeUnchangedFields,
    diffModelFields,
    findTouchedFields,
    type FieldChange,
} from './modelFieldDiff';

const explore = (dimensions: Record<string, object>): Explore =>
    ({
        baseTable: 'customers',
        tables: {
            customers: { name: 'customers', dimensions, metrics: {} },
        },
    }) as unknown as Explore;

describe('diffModelFields', () => {
    it('reports new, changed and removed fields of the model', () => {
        const live = explore({
            first_name: {
                name: 'first_name',
                label: 'First name',
                description: 'old',
                compiledSql: 'a',
            },
            gone: { name: 'gone', label: 'Gone' },
        });
        const mine = explore({
            first_name: {
                name: 'first_name',
                label: 'First name',
                description: 'new',
                compiledSql: 'b',
            },
            added: { name: 'added', label: 'Added' },
        });
        expect(diffModelFields(live, mine)).toEqual([
            {
                key: 'customers.first_name',
                table: 'customers',
                name: 'first_name',
                isMetric: false,
                field: mine.tables.customers.dimensions.first_name,
                label: 'First name',
                kind: 'changed',
                attributes: ['description'],
            },
            {
                key: 'customers.added',
                table: 'customers',
                name: 'added',
                isMetric: false,
                field: mine.tables.customers.dimensions.added,
                label: 'Added',
                kind: 'new',
                attributes: [],
            },
            {
                key: 'customers.gone',
                table: 'customers',
                name: 'gone',
                isMetric: false,
                field: live.tables.customers.dimensions.gone,
                label: 'Gone',
                kind: 'removed',
                attributes: [],
            },
        ]);
    });

    it('reports nothing when only derived values differ', () => {
        const live = explore({
            a: { name: 'a', label: 'A', compiledSql: 'x' },
        });
        const mine = explore({
            a: { name: 'a', label: 'A', compiledSql: 'y' },
        });
        expect(diffModelFields(live, mine)).toEqual([]);
    });
});

describe('diffModelFields equality', () => {
    it('ignores key order and the ids each compile gives filters', () => {
        const live = explore({
            a: {
                name: 'a',
                spotlight: { categories: ['x'], visibility: 'show' },
                filters: [{ id: '1', operator: 'equals', values: [1] }],
            },
        });
        const mine = explore({
            a: {
                name: 'a',
                spotlight: { visibility: 'show', categories: ['x'] },
                filters: [{ values: [1], id: '2', operator: 'equals' }],
            },
        });
        expect(diffModelFields(live, mine)).toEqual([]);
    });
});

describe('findTouchedFields', () => {
    it('lists redefined and removed fields, not relabelled or new ones', () => {
        const field = (name: string, compiledSql: string, label = name) => ({
            name,
            label,
            table: 'customers',
            compiledSql,
        });
        const live = explore({
            same: field('same', 'a'),
            relabelled: field('relabelled', 'b'),
            redefined: field('redefined', 'c'),
            gone: field('gone', 'd'),
        });
        const mine = explore({
            same: field('same', 'a'),
            relabelled: field('relabelled', 'b', 'New label'),
            redefined: field('redefined', 'c2'),
            added: field('added', 'e'),
        });
        expect(findTouchedFields(live, mine)).toEqual([
            {
                model: 'customers',
                fieldId: 'customers_redefined',
                label: 'redefined',
                kind: 'changed',
            },
            {
                model: 'customers',
                fieldId: 'customers_gone',
                label: 'gone',
                kind: 'removed',
            },
        ]);
    });
});

describe('describeUnchangedFields', () => {
    const [added] = diffModelFields(
        null,
        explore({ added: { name: 'added', label: 'Added' } }),
    );
    const some: FieldChange[] = [added];

    it('says it once for any number of models, with the files that did change', () => {
        expect(describeUnchangedFields([[], [], []], true, 3)).toBe(
            '3 files changed. No field is added, changed or removed.',
        );
        expect(describeUnchangedFields([[]], true, 1)).toBe(
            '1 file changed. No field is added, changed or removed.',
        );
        expect(describeUnchangedFields([[], null], true, 0)).toBe(
            'No field is added, changed or removed.',
        );
    });

    it('concludes nothing until the compiled fields are read', () => {
        expect(describeUnchangedFields([[], []], false, 2)).toBe(
            'Fields show here once the draft compiles.',
        );
    });

    it('says nothing when a field changes or no model is read', () => {
        expect(describeUnchangedFields([[], some], true, 2)).toBeNull();
        expect(describeUnchangedFields([null, null], true, 2)).toBeNull();
    });
});

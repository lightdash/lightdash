import { type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { diffModelFields, findTouchedFields } from './modelFieldDiff';

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
                label: 'First name',
                kind: 'changed',
                attributes: ['description'],
            },
            {
                key: 'customers.added',
                label: 'Added',
                kind: 'new',
                attributes: [],
            },
            {
                key: 'customers.gone',
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

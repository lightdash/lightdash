import { type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { diffModelFields } from './modelFieldDiff';

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

import {
    FilterOperator,
    DashboardControlRefKind as K,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { rendersDefaultControlOrder } from './controlOrder';

const filter = (
    id: string,
    fieldId: string,
    sectionId?: string,
): DashboardFilterRule =>
    ({
        id,
        target: { fieldId, tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: [id],
        ...(sectionId && { sectionId }),
    }) as DashboardFilterRule;

const controls = (
    dimensions: DashboardFilterRule[],
    sections: { id: string; name: string; inline?: boolean }[] = [],
) => ({
    filters: { dimensions, metrics: [] },
    parameterControls: [],
    sections,
});

describe('rendersDefaultControlOrder', () => {
    it('keeps the order when the edit places a new filter first', () => {
        const saved = controls([filter('a', 'x'), filter('b', 'y')]);
        const edited = controls([
            filter('a', 'x'),
            filter('b', 'y'),
            filter('c', 'z'),
        ]);
        const order = [
            { kind: K.FILTER, id: 'c' },
            { kind: K.FILTER, id: 'a' },
            { kind: K.FILTER, id: 'b' },
        ];
        expect(rendersDefaultControlOrder(order, edited, saved)).toBe(false);
    });

    it('keeps a swap of two filters on the same field (re-minted ids)', () => {
        const saved = controls([filter('a1', 'x'), filter('a2', 'x')]);
        const edited = controls([filter('n1', 'x'), filter('n2', 'x')]);
        const order = [
            { kind: K.FILTER, id: 'n2' },
            { kind: K.FILTER, id: 'n1' },
        ];
        expect(rendersDefaultControlOrder(order, edited, saved)).toBe(false);
    });

    it('stores nothing when the edit adds a section and moves a saved filter into it', () => {
        const saved = controls([filter('a', 'x'), filter('b', 'y')]);
        const edited = controls(
            [filter('a', 'x', 's'), filter('b', 'y')],
            [{ id: 's', name: 'S' }],
        );
        const order = [
            { kind: K.FILTER, id: 'a' },
            { kind: K.FILTER, id: 'b' },
        ];
        expect(rendersDefaultControlOrder(order, edited, saved)).toBe(true);
    });

    it('stores nothing when the edit only moves a filter out of its section', () => {
        const saved = controls(
            [filter('a', 'x', 's'), filter('b', 'y')],
            [{ id: 's', name: 'S' }],
        );
        const edited = controls(
            [filter('a', 'x'), filter('b', 'y')],
            [{ id: 's', name: 'S' }],
        );
        const order = [
            { kind: K.FILTER, id: 'b' },
            { kind: K.SECTION, id: 's', newLine: true },
            { kind: K.FILTER, id: 'a' },
        ];
        expect(rendersDefaultControlOrder(order, edited, saved)).toBe(true);
    });
});

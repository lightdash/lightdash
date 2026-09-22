import { type ItemsMap } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resolveVizPointMenuState } from './vizPointMenuConfig';

// Same minimal metric/dimension fixtures the drill-down resolver tests use —
// only the fields the type guards discriminate on.
const metricItem = {
    fieldType: 'metric',
    type: 'count',
    name: 'revenue',
    table: 'orders',
    label: 'Revenue',
    hidden: false,
} as unknown as ItemsMap[string];
const dimensionItem = {
    fieldType: 'dimension',
    type: 'string',
    name: 'status',
    table: 'orders',
    label: 'Status',
    hidden: false,
} as unknown as ItemsMap[string];

const itemsMap = {
    orders_revenue: metricItem,
    orders_status: dimensionItem,
} as ItemsMap;
const fieldMapping = { value: 'orders_revenue', category: 'orders_status' };

const row = {
    orders_revenue: { value: { raw: 42, formatted: '42' } },
    orders_status: { value: { raw: 'done', formatted: 'Done' } },
    junk: { nope: true },
};

const validIntent = () => ({ row, metric: 'value', x: 10, y: 20 });

const rect = (r: {
    left: number;
    top: number;
    width: number;
    height: number;
}) => new DOMRect(r.left, r.top, r.width, r.height);

const baseArgs = (
    overrides: Partial<Parameters<typeof resolveVizPointMenuState>[1]> = {},
) => ({
    fieldMapping,
    itemsMap,
    iframeRect: rect({ left: 0, top: 0, width: 400, height: 300 }),
    drillDownEnabled: false,
    underlyingDataEnabled: false,
    dateZoom: undefined,
    ...overrides,
});

describe('resolveVizPointMenuState', () => {
    it('rejects a non-intent payload', () => {
        expect(() => resolveVizPointMenuState(null, baseArgs())).toThrow(
            'Invalid point-menu request.',
        );
    });

    it('rejects missing coordinates', () => {
        expect(() =>
            resolveVizPointMenuState({ row, metric: 'value' }, baseArgs()),
        ).toThrow('Invalid point-menu request.');
    });

    it('rejects non-finite coordinates', () => {
        expect(() =>
            resolveVizPointMenuState(
                { ...validIntent(), x: Number.NaN },
                baseArgs(),
            ),
        ).toThrow('Invalid point-menu request.');
        expect(() =>
            resolveVizPointMenuState(
                { ...validIntent(), y: Number.POSITIVE_INFINITY },
                baseArgs(),
            ),
        ).toThrow('Invalid point-menu request.');
    });

    it('offsets the position by the iframe rect', () => {
        const state = resolveVizPointMenuState(
            validIntent(),
            baseArgs({
                iframeRect: rect({
                    left: 100,
                    top: 50,
                    width: 400,
                    height: 300,
                }),
            }),
        );
        expect(state.position).toEqual({ left: 110, top: 70 });
    });

    it('clamps the position into the iframe rect', () => {
        const state = resolveVizPointMenuState(
            { ...validIntent(), x: 5000, y: -20 },
            baseArgs({
                iframeRect: rect({
                    left: 100,
                    top: 50,
                    width: 400,
                    height: 300,
                }),
            }),
        );
        expect(state.position).toEqual({ left: 500, top: 50 });
    });

    it('resolves the copy value from the clicked metric cell', () => {
        expect(
            resolveVizPointMenuState(validIntent(), baseArgs()).copyValue,
        ).toBe('42');
    });

    it('leaves the copy value undefined when the metric slot is unresolvable', () => {
        expect(
            resolveVizPointMenuState(
                { ...validIntent(), metric: 'ghost' },
                baseArgs(),
            ).copyValue,
        ).toBeUndefined();
    });

    it('resolves a drill config when drill is enabled', () => {
        const state = resolveVizPointMenuState(
            validIntent(),
            baseArgs({ drillDownEnabled: true }),
        );
        expect(state.drillConfig?.item).toBe(metricItem);
    });

    it('omits drill config when disabled and builds dashboard filters from dimension cells', () => {
        const state = resolveVizPointMenuState(
            validIntent(),
            baseArgs({ drillDownEnabled: false }),
        );
        expect(state.drillConfig).toBeUndefined();
        expect(state.filters).toHaveLength(1);
        expect(state.filters[0].target.fieldId).toBe('orders_status');
        expect(state.filters[0].values).toEqual(['done']);
    });

    it('leaves underlying-data config undefined when the metric slot is unresolvable, even with underlyingDataEnabled', () => {
        const state = resolveVizPointMenuState(
            { ...validIntent(), metric: 'ghost' },
            baseArgs({ underlyingDataEnabled: true }),
        );
        expect(state.underlyingDataConfig).toBeUndefined();
    });

    it('resolves an underlying-data config when underlying data is enabled', () => {
        const state = resolveVizPointMenuState(
            validIntent(),
            baseArgs({ underlyingDataEnabled: true }),
        );
        expect(state.underlyingDataConfig?.item).toBe(metricItem);
    });
});

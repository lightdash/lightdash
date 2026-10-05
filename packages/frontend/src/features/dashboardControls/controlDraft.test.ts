import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameterControl,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    commitFilterControl,
    commitParameterControl,
    getParameterValueWrites,
    isControlMapped,
    applyFilterControl,
    applyParameterControl,
    changeControl,
    hasControlChanges,
    startControl,
    withAppliedSettings,
    withOutsideChanges,
    type FilterControlDraft,
    type ParameterControlDraft,
} from './controlDraft';

const rule = (
    id: string,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    tileTargets: {},
    ...overrides,
});

const filters: DashboardFilters = {
    dimensions: [rule('a'), rule('b')],
    metrics: [rule('m')],
    tableCalculations: [],
};

describe('commitFilterControl', () => {
    it('adds a new control at the end of its list', () => {
        const next = commitFilterControl(filters, rule('new'), 'dimensions');
        expect(next.dimensions.map((r) => r.id)).toEqual(['a', 'b', 'new']);
        expect(next.metrics).toEqual(filters.metrics);
    });

    it('replaces an existing control in place, mapping and settings together', () => {
        const edited = rule('a', {
            values: ['completed'],
            additionalTargets: [
                { fieldId: 'payments_status', tableName: 'payments' },
            ],
            tileTargets: { tile: false },
        });
        const next = commitFilterControl(filters, edited, 'dimensions');
        expect(next.dimensions).toEqual([edited, filters.dimensions[1]]);
    });

    it('moves a control whose own field became a metric', () => {
        const next = commitFilterControl(filters, rule('a'), 'metrics');
        expect(next.dimensions.map((r) => r.id)).toEqual(['b']);
        expect(next.metrics.map((r) => r.id)).toEqual(['m', 'a']);
    });

    it('leaves the filters untouched until then', () => {
        commitFilterControl(filters, rule('a', { label: 'Edited' }), 'metrics');
        expect(filters.dimensions[0].label).toBeUndefined();
        expect(filters.metrics.map((r) => r.id)).toEqual(['m']);
    });
});

const control = (
    id: string,
    parameterKeys: string[],
): DashboardParameterControl => ({
    id,
    label: id,
    parameterKeys,
    tileTargets: {},
});

describe('commitParameterControl', () => {
    const controls = [control('currency', ['orders.currency'])];

    it('adds a new control and replaces an existing one', () => {
        const added = commitParameterControl(
            controls,
            control('status', ['tracked_status']),
        );
        expect(added.map((c) => c.id)).toEqual(['currency', 'status']);

        const edited = control('currency', [
            'orders.currency',
            'payments.currency',
        ]);
        expect(commitParameterControl(added, edited)).toEqual([
            edited,
            added[1],
        ]);
    });
});

describe('getParameterValueWrites', () => {
    it('writes the value under every parameter of a new control', () => {
        expect(
            getParameterValueWrites(
                undefined,
                control('currency', ['orders.currency', 'payments.currency']),
                'EUR',
            ),
        ).toEqual([
            { key: 'orders.currency', value: 'EUR' },
            { key: 'payments.currency', value: 'EUR' },
        ]);
    });

    it('clears a parameter that left the control', () => {
        expect(
            getParameterValueWrites(
                control('currency', ['orders.currency', 'payments.currency']),
                control('currency', ['payments.currency']),
                null,
            ),
        ).toEqual([
            { key: 'orders.currency', value: null },
            { key: 'payments.currency', value: null },
        ]);
    });
});

describe('isControlMapped', () => {
    const newFilter = (fieldId: string) => ({
        kind: 'filter' as const,
        isNew: true,
        controlType: 'text' as const,
        rule: rule('new', { target: { fieldId, tableName: '' } }),
    });
    const newParameter = (parameterKeys: string[]) => ({
        kind: 'parameter' as const,
        isNew: true,
        controlType: 'text' as const,
        control: control('new', parameterKeys),
        value: null,
        extraTileKeys: {},
    });

    it('holds a new control back until its first field or parameter', () => {
        expect(isControlMapped(newFilter(''))).toBe(false);
        expect(isControlMapped(newFilter('orders_status'))).toBe(true);
        expect(isControlMapped(newParameter([]))).toBe(false);
        expect(isControlMapped(newParameter(['orders.currency']))).toBe(true);
    });
});

describe('withAppliedSettings', () => {
    it('takes the settings and keeps the mapping and lock the dashboard has now', () => {
        const current = rule('a', {
            additionalTargets: [
                { fieldId: 'payments_status', tableName: 'payments' },
            ],
            tileTargets: { tile: false },
            lockedTabUuids: ['tab-1'],
        });
        // The pending copy was taken before the mapping and lock changed
        const pending = rule('a', {
            label: 'Status',
            values: ['completed'],
            required: true,
        });
        expect(withAppliedSettings(current, pending)).toEqual({
            ...current,
            label: 'Status',
            values: ['completed'],
            required: true,
        });
    });
});

const filterDraft = (
    isNew: boolean,
    overrides: Partial<DashboardFilterRule> = {},
): FilterControlDraft => ({
    kind: 'filter',
    isNew,
    controlType: 'text',
    rule: rule('a', overrides),
});

const parameterDraft = (
    isNew: boolean,
    parameterKeys: string[],
    value: string | null = null,
): ParameterControlDraft => ({
    kind: 'parameter',
    isNew,
    controlType: 'text',
    control: control('currency', parameterKeys),
    value,
    extraTileKeys: {},
});

describe('an open control', () => {
    it('starts with no changes', () => {
        const open = startControl(filterDraft(false));
        expect(open.draft).toBe(open.base);
        expect(hasControlChanges(open)).toBe(false);
    });

    it('has changes once its draft differs, whatever tab made them', () => {
        const open = startControl(filterDraft(false));
        const withSetting = changeControl(
            open,
            filterDraft(false, { values: ['completed'] }),
        );
        const withTile = changeControl(
            open,
            filterDraft(false, { tileTargets: { tile: false } }),
        );
        expect(hasControlChanges(withSetting)).toBe(true);
        expect(hasControlChanges(withTile)).toBe(true);
        expect(withTile.base).toBe(open.base);
    });

    it('has none again when a change is taken back', () => {
        const open = startControl(filterDraft(false));
        const changed = changeControl(
            open,
            filterDraft(false, { label: 'Status' }),
        );
        expect(
            hasControlChanges(changeControl(changed, filterDraft(false))),
        ).toBe(false);
    });

    it('leaves the dashboard as it was until it is applied', () => {
        const before = structuredClone(filters);
        changeControl(
            startControl(filterDraft(false)),
            filterDraft(false, { values: ['completed'] }),
        );
        // "Cancel" drops the open control: there is nothing to take back
        expect(filters).toEqual(before);
    });
});

describe('applyFilterControl', () => {
    it('writes settings and tiles of an existing control in one step', () => {
        const base = filterDraft(false);
        const draft = filterDraft(false, {
            values: ['completed'],
            tileTargets: { tile: false },
        });
        const next = applyFilterControl(filters, draft, base, 'dimensions');
        expect(next.dimensions).toEqual([draft.rule, filters.dimensions[1]]);
    });

    it('creates a new control at the end of its list', () => {
        const base: FilterControlDraft = {
            ...filterDraft(true),
            rule: rule('new', { target: { fieldId: '', tableName: '' } }),
        };
        const draft: FilterControlDraft = { ...base, rule: rule('new') };
        const next = applyFilterControl(filters, draft, base, 'dimensions');
        expect(next.dimensions.map((r) => r.id)).toEqual(['a', 'b', 'new']);
    });

    it('keeps what the pill or the rules changed while the control was open', () => {
        const base = filterDraft(false);
        const draft = filterDraft(false, { values: ['completed'] });
        const outside: DashboardFilters = {
            ...filters,
            dimensions: [
                rule('a', { required: true, lockedTabUuids: ['tab-1'] }),
                filters.dimensions[1],
            ],
        };
        const next = applyFilterControl(outside, draft, base, 'dimensions');
        expect(next.dimensions[0]).toEqual({
            ...draft.rule,
            required: true,
            lockedTabUuids: ['tab-1'],
        });
    });

    it('lets the draft win where it changed the same thing', () => {
        const base = filterDraft(false);
        const draft = filterDraft(false, { required: false });
        const outside: DashboardFilters = {
            ...filters,
            dimensions: [rule('a', { required: true }), filters.dimensions[1]],
        };
        expect(
            withOutsideChanges(draft.rule, base.rule, outside.dimensions[0])
                .required,
        ).toBe(false);
    });
});

describe('applyParameterControl', () => {
    const controls = [control('currency', ['orders.currency'])];

    it('writes the control and its value under every parameter', () => {
        const draft = parameterDraft(
            false,
            ['orders.currency', 'payments.currency'],
            'EUR',
        );
        const applied = applyParameterControl(controls, draft, 'Currency');
        expect(applied.controls).toEqual([
            { ...draft.control, label: 'Currency' },
        ]);
        expect(applied.writes).toEqual([
            { key: 'orders.currency', value: 'EUR' },
            { key: 'payments.currency', value: 'EUR' },
        ]);
    });

    it('creates a new control and clears nothing', () => {
        const draft: ParameterControlDraft = {
            ...parameterDraft(true, ['tracked_status'], 'open'),
            control: control('status', ['tracked_status']),
        };
        const applied = applyParameterControl(controls, draft, 'Status');
        expect(applied.controls.map((c) => c.id)).toEqual([
            'currency',
            'status',
        ]);
        expect(applied.writes).toEqual([
            { key: 'tracked_status', value: 'open' },
        ]);
    });

    it('clears a parameter the draft took out', () => {
        const applied = applyParameterControl(
            [control('currency', ['orders.currency', 'payments.currency'])],
            parameterDraft(false, ['payments.currency'], 'EUR'),
            'Currency',
        );
        expect(applied.writes).toEqual([
            { key: 'orders.currency', value: null },
            { key: 'payments.currency', value: 'EUR' },
        ]);
    });
});

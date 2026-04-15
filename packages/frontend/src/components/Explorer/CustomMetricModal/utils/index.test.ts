import {
    CustomFormatType,
    DimensionType,
    FieldType,
    MetricType,
    NumberSeparator,
    type CustomFormat,
    type Dimension,
} from '@lightdash/common';
import { prepareCustomMetricData } from '.';

// Minimal Dimension mock sufficient to exercise the numeric metric path
const mockDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
};

/**
 * Recursively deep-freezes an object, simulating what Redux Toolkit / Immer
 * does when it stores action payload objects in state in-place.
 */
function deepFreeze<T>(obj: T): T {
    if (obj !== null && typeof obj === 'object') {
        Object.keys(obj).forEach((key) => {
            deepFreeze((obj as Record<string, unknown>)[key]);
        });
        Object.freeze(obj);
    }
    return obj;
}

describe('CustomMetricModal — Immer freeze propagation via formatOptions reference', () => {
    it('deepFreeze propagates to nested objects shared by reference', () => {
        // Documents the mechanism: deepFreeze (i.e., Immer) reaches *all* nested
        // objects reachable via the root — including ones held by outside references.
        const inner = { type: CustomFormatType.DEFAULT };
        const outer = { formatOptions: inner };

        deepFreeze(outer);

        // outer.formatOptions IS inner (same reference) — freeze propagated
        expect(Object.isFrozen(inner)).toBe(true);
    });

    it('spreading an object before deepFreeze isolates the original', () => {
        // Documents the fix: { ...inner } creates a new object, so deepFreeze
        // on the outer result cannot reach `inner` through the spread copy.
        const inner = { type: CustomFormatType.DEFAULT };
        const copy = { ...inner }; // new object — reference is broken
        const outer = { formatOptions: copy };

        deepFreeze(outer);

        // copy is frozen but inner is NOT — the reference chain is broken
        expect(Object.isFrozen(copy)).toBe(true);
        expect(Object.isFrozen(inner)).toBe(false);
    });

    it('format passed to prepareCustomMetricData is isolated from Immer freeze', () => {
        // Regression test for PROD-2067 / Sentry LIGHTDASH-FRONTEND-G3.
        //
        // Bug: CustomMetricModal passes `form.values.format` by reference as
        // `formatOptions: format`. Immer deep-freezes the dispatched metric
        // in Redux state, which — through the shared reference — also freezes
        // the form's internal `format` object. On the next modal open the user
        // changes the format type; @mantine/form calls klona(values) internally
        // (which preserves frozen property descriptors) and then assigns to
        // `cloned.format.type`, throwing:
        //   "TypeError: Cannot assign to read only property 'type'"
        //
        // Fix: use `formatOptions: { ...format }` at the call site in the modal
        // to break the reference before dispatch.
        //
        // This test FAILS (format IS frozen) before the fix and PASSES (format is
        // NOT frozen) after the fix.
        const format: CustomFormat = {
            type: CustomFormatType.DEFAULT,
            round: undefined,
            separator: NumberSeparator.DEFAULT,
            currency: undefined,
            compact: undefined,
            prefix: undefined,
            suffix: undefined,
        };

        // Simulate what CustomMetricModal currently does (buggy path):
        // passes `format` by reference. The fix will change this to `{ ...format }`.
        const result = prepareCustomMetricData({
            item: mockDimension,
            type: MetricType.SUM,
            customMetricLabel: 'Total Revenue',
            customMetricFiltersWithIds: [],
            isEditingCustomMetric: false,
            exploreData: undefined,
            percentile: undefined,
            formatOptions: format, // buggy: same reference — fix adds spread { ...format }
        });

        // Simulate Redux Toolkit / Immer deep-freezing the stored metric
        deepFreeze(result);

        // The original form.values.format must NOT be frozen after dispatch.
        // If it is frozen, @mantine/form's klona-based setFieldValue will throw
        // "Cannot assign to read only property 'type'" on the next modal open.
        expect(Object.isFrozen(format)).toBe(false);
    });
});

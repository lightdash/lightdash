import {
    DimensionType,
    FieldType,
    FilterOperator,
    getFilterOperatorOptions,
    TimeFrames,
    UnitOfTime,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    CONTROL_TYPES,
    getDraftSettingsField,
    getFilterTypeForControl,
} from './controlType';
import { createFilterDraft, reconcileDraftWithField } from './filterDraft';

const dimension = (
    overrides: Partial<FilterableDimension>,
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date',
    label: 'Order date',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
    ...overrides,
});

const dayField = dimension({});
const timestampField = dimension({ type: DimensionType.TIMESTAMP });
const monthField = dimension({ timeInterval: TimeFrames.MONTH });

const withDefault = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    ...createFilterDraft('date').rule,
    disabled: false,
    ...overrides,
});

describe('createFilterDraft', () => {
    it('starts every type with no field and no default value', () => {
        CONTROL_TYPES.forEach((controlType) => {
            const { rule } = createFilterDraft(controlType);
            expect(rule.target.fieldId).toBe('');
            expect(rule.disabled).toBe(true);
            expect(rule.operator).toBe(FilterOperator.EQUALS);
        });
    });

    it('offers the same operators as a filter with no field', () => {
        CONTROL_TYPES.forEach((controlType) => {
            const filterType = getFilterTypeForControl(controlType);
            expect(
                getFilterOperatorOptions(
                    filterType,
                    getDraftSettingsField(controlType),
                ),
            ).toEqual(getFilterOperatorOptions(filterType, undefined));
        });
    });
});

describe('reconcileDraftWithField', () => {
    const equalsDay = withDefault({ values: ['2026-01-15'] });

    it('keeps a typed date on a day-grain date field', () => {
        expect(reconcileDraftWithField(equalsDay, 'date', dayField)).toBe(
            equalsDay,
        );
    });

    it('clears a typed date on a timestamp or an interval field', () => {
        [timestampField, monthField].forEach((field) => {
            const next = reconcileDraftWithField(equalsDay, 'date', field);
            expect(next.disabled).toBe(true);
            expect(next.values ?? []).toEqual([]);
            expect(next.operator).toBe(FilterOperator.EQUALS);
        });
    });

    it('keeps a date and time typed in a time control on its timestamp field', () => {
        const typed = {
            ...createFilterDraft('time').rule,
            disabled: false,
            values: ['2026-01-15T10:30:00Z'],
        };
        expect(reconcileDraftWithField(typed, 'time', timestampField)).toBe(
            typed,
        );
    });

    it('keeps a relative default whose unit the field allows', () => {
        const inThePast = withDefault({
            operator: FilterOperator.IN_THE_PAST,
            values: [3],
            settings: { unitOfTime: UnitOfTime.months },
        });
        expect(reconcileDraftWithField(inThePast, 'date', monthField)).toBe(
            inThePast,
        );
        expect(reconcileDraftWithField(inThePast, 'date', timestampField)).toBe(
            inThePast,
        );
    });

    it('clears a relative default finer than the field interval', () => {
        const inThePast = withDefault({
            operator: FilterOperator.IN_THE_PAST,
            values: [7],
            settings: { unitOfTime: UnitOfTime.days },
        });
        const next = reconcileDraftWithField(inThePast, 'date', monthField);
        expect(next.disabled).toBe(true);
        expect(next.operator).toBe(FilterOperator.IN_THE_PAST);
    });

    it('falls back to "is" when the field does not offer the operator', () => {
        // Period to date needs the raw date, which a month field alone lacks
        const periodToDate = withDefault({
            operator: FilterOperator.IN_PERIOD_TO_DATE,
            settings: { unitOfTime: UnitOfTime.months },
        });
        const next = reconcileDraftWithField(periodToDate, 'date', monthField);
        expect(next.operator).toBe(FilterOperator.EQUALS);
        expect(next.disabled).toBe(true);
    });

    it('leaves a control with no default value and other types alone', () => {
        const noDefault = createFilterDraft('date').rule;
        expect(reconcileDraftWithField(noDefault, 'date', monthField)).toBe(
            noDefault,
        );
        const text = {
            ...createFilterDraft('text').rule,
            disabled: false,
            values: ['completed'],
        };
        expect(
            reconcileDraftWithField(
                text,
                'text',
                dimension({ type: DimensionType.STRING }),
            ),
        ).toBe(text);
    });
});

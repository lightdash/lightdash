import { FilterOperator } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    hasSchedulerFilterChanged,
    withDerivedDisabledState,
    type SchedulerOverridableRule,
} from './schedulerFilterOverrides';

const baseRule: SchedulerOverridableRule = {
    id: 'rule-1',
    target: { fieldId: 'customers_first_name' },
    operator: FilterOperator.EQUALS,
    values: [],
};

describe('withDerivedDisabledState', () => {
    it('disables a value filter with no values', () => {
        expect(withDerivedDisabledState(baseRule).disabled).toBe(true);
        expect(
            withDerivedDisabledState({ ...baseRule, values: undefined })
                .disabled,
        ).toBe(true);
    });

    it('keeps a value filter with values enabled', () => {
        expect(
            withDerivedDisabledState({ ...baseRule, values: ['adam'] })
                .disabled,
        ).toBe(false);
    });

    it('keeps a null-only equals rule enabled so the delivery applies IS NULL', () => {
        expect(
            withDerivedDisabledState({ ...baseRule, includeNull: true })
                .disabled,
        ).toBe(false);
        expect(
            withDerivedDisabledState({
                ...baseRule,
                values: undefined,
                includeNull: true,
            }).disabled,
        ).toBe(false);
    });
});

describe('hasSchedulerFilterChanged', () => {
    it('treats includeNull: false as equal to a saved rule without includeNull', () => {
        expect(
            hasSchedulerFilterChanged(baseRule, {
                ...baseRule,
                includeNull: false,
            }),
        ).toBe(false);
    });

    it('detects a null-only selection as an override', () => {
        expect(
            hasSchedulerFilterChanged(baseRule, {
                ...baseRule,
                includeNull: true,
            }),
        ).toBe(true);
    });
});

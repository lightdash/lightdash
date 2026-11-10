import { describe, expect, it } from 'vitest';
import { DimensionType } from '../../../../types/field';
import {
    FilterOperator,
    FilterType,
    UnitOfTime,
} from '../../../../types/filter';
import dateFilterSchema from './dateFilters';
import { filterRuleSchemaTransformed } from './index';

const currentPeriodRule = (settings: Record<string, unknown>) => ({
    fieldId: 'orders_order_date',
    fieldType: DimensionType.DATE,
    fieldFilterType: FilterType.DATE,
    operator: FilterOperator.IN_THE_CURRENT,
    values: [1],
    settings: { completed: false, ...settings },
});

describe('dateFilterSchema current-period bounds', () => {
    it('accepts toDate on a current month', () => {
        const result = dateFilterSchema.safeParse(
            currentPeriodRule({ unitOfTime: UnitOfTime.months, toDate: true }),
        );
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            settings: {
                completed: false,
                unitOfTime: UnitOfTime.months,
                toDate: true,
            },
        });
    });

    it('accepts excludeToday together with toDate', () => {
        const result = dateFilterSchema.safeParse(
            currentPeriodRule({
                unitOfTime: UnitOfTime.quarters,
                toDate: true,
                excludeToday: true,
            }),
        );
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            settings: { toDate: true, excludeToday: true },
        });
    });

    it('rejects excludeToday without toDate', () => {
        expect(
            dateFilterSchema.safeParse(
                currentPeriodRule({
                    unitOfTime: UnitOfTime.months,
                    excludeToday: true,
                }),
            ).success,
        ).toBe(false);
    });

    it('rejects toDate on days', () => {
        expect(
            dateFilterSchema.safeParse(
                currentPeriodRule({
                    unitOfTime: UnitOfTime.days,
                    toDate: true,
                }),
            ).success,
        ).toBe(false);
    });

    it('rejects false literals instead of silently keeping them', () => {
        expect(
            dateFilterSchema.safeParse(
                currentPeriodRule({
                    unitOfTime: UnitOfTime.months,
                    toDate: false,
                }),
            ).success,
        ).toBe(false);
    });

    it('still accepts a current period without bounds', () => {
        expect(
            dateFilterSchema.safeParse(
                currentPeriodRule({ unitOfTime: UnitOfTime.days }),
            ).success,
        ).toBe(true);
    });

    it('keeps the bounds on the transformed filter rule', () => {
        const rule = filterRuleSchemaTransformed.parse(
            currentPeriodRule({
                unitOfTime: UnitOfTime.years,
                toDate: true,
                excludeToday: true,
            }),
        );
        expect(rule.settings).toEqual({
            completed: false,
            unitOfTime: UnitOfTime.years,
            toDate: true,
            excludeToday: true,
        });
    });
});

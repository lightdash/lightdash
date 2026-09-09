import { FilterOperator, type FilterRule, type Filters } from '../types/filter';
import {
    applyChartFilterOverrides,
    applyChartFilterOverridesToFilterGroup,
    getFilterRulesFromGroup,
} from './filters';

const rule = (
    id: string,
    fieldId: string,
    values: unknown[],
    extra: Partial<FilterRule> = {},
): FilterRule => ({
    id,
    target: { fieldId },
    operator: FilterOperator.EQUALS,
    values,
    ...extra,
});

const statusRule = rule('status', 'orders_status', ['completed']);
const paymentRule = rule('payment', 'orders_payment_method', ['credit_card']);

const savedFilters: Filters = {
    dimensions: {
        id: 'dimensions',
        and: [statusRule, { id: 'nested', or: [paymentRule] }],
    },
    metrics: {
        id: 'metrics',
        and: [
            rule('amount', 'orders_total_order_amount', [100], {
                operator: FilterOperator.GREATER_THAN,
            }),
        ],
    },
};

describe('applyChartFilterOverrides', () => {
    it('returns the saved filters untouched when there are no overrides', () => {
        expect(applyChartFilterOverrides(savedFilters, {})).toEqual(
            savedFilters,
        );
    });

    it('replaces a saved rule by id, keeping the nested group structure', () => {
        const result = applyChartFilterOverrides(savedFilters, {
            dimensions: {
                id: 'override-group',
                and: [rule('payment', 'orders_payment_method', ['bank'])],
            },
        });

        expect(result.dimensions).toEqual({
            id: 'dimensions',
            and: [
                statusRule,
                {
                    id: 'nested',
                    or: [rule('payment', 'orders_payment_method', ['bank'])],
                },
            ],
        });
        expect(result.metrics).toEqual(savedFilters.metrics);
    });

    it('keeps the saved identity, target and requirement flag on an override', () => {
        const required = {
            dimensions: {
                id: 'dimensions',
                and: [
                    rule('status', 'orders_status', ['completed'], {
                        required: true,
                    }),
                ],
            },
        };
        const result = applyChartFilterOverrides(required, {
            dimensions: {
                id: 'override-group',
                and: [
                    rule('status', 'orders_other_field', ['shipped'], {
                        required: false,
                        disabled: true,
                    }),
                ],
            },
        });

        expect(getFilterRulesFromGroup(result.dimensions)).toEqual([
            {
                id: 'status',
                target: { fieldId: 'orders_status' },
                operator: FilterOperator.EQUALS,
                values: ['shipped'],
                required: true,
                disabled: true,
            },
        ]);
    });

    it('re-homes an override with an unknown id onto the saved rule for the same field', () => {
        const result = applyChartFilterOverrides(savedFilters, {
            dimensions: {
                id: 'override-group',
                and: [rule('recreated', 'orders_status', ['shipped'])],
            },
        });

        const rules = getFilterRulesFromGroup(result.dimensions);
        expect(rules).toHaveLength(2);
        expect(rules[0]).toEqual(rule('status', 'orders_status', ['shipped']));
    });

    it('ANDs overrides that match nothing onto the group with required stripped', () => {
        const result = applyChartFilterOverridesToFilterGroup(
            savedFilters.dimensions,
            {
                id: 'override-group',
                and: [
                    rule('status', 'orders_status', ['shipped']),
                    rule('new', 'customers_first_name', ['Ann'], {
                        required: true,
                    }),
                ],
            },
        );

        expect(result).toMatchObject({
            and: [
                {
                    id: 'dimensions',
                    and: [
                        rule('status', 'orders_status', ['shipped']),
                        { id: 'nested', or: [paymentRule] },
                    ],
                },
                {
                    id: 'override-group',
                    and: [
                        {
                            ...rule('new', 'customers_first_name', ['Ann']),
                            required: undefined,
                        },
                    ],
                },
            ],
        });
    });

    it('keeps the override group structure for rules that only add filters', () => {
        const alertFilters = {
            id: 'alert',
            or: [
                rule('a', 'customers_first_name', ['Ann']),
                rule('b', 'customers_first_name', ['Bob']),
            ],
        };

        const result = applyChartFilterOverridesToFilterGroup(
            undefined,
            alertFilters,
        );

        expect(result).toMatchObject({
            and: [
                {
                    id: 'alert',
                    or: [
                        { ...alertFilters.or[0], required: undefined },
                        { ...alertFilters.or[1], required: undefined },
                    ],
                },
            ],
        });
    });

    it('leaves saved rules that have no override on their chart default', () => {
        const result = applyChartFilterOverrides(savedFilters, {
            dimensions: { id: 'override-group', and: [] },
        });

        expect(result).toEqual(savedFilters);
    });

    it('does not let one override replace two saved rules on the same field', () => {
        const twoOnSameField: Filters = {
            dimensions: {
                id: 'dimensions',
                and: [
                    rule('from', 'orders_order_date', ['2026-01-01'], {
                        operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                    }),
                    rule('to', 'orders_order_date', ['2026-02-01'], {
                        operator: FilterOperator.LESS_THAN,
                    }),
                ],
            },
        };
        const result = applyChartFilterOverrides(twoOnSameField, {
            dimensions: {
                id: 'override-group',
                and: [
                    rule('unknown', 'orders_order_date', ['2026-03-01'], {
                        operator: FilterOperator.LESS_THAN,
                    }),
                ],
            },
        });

        const rules = getFilterRulesFromGroup(result.dimensions);
        expect(rules).toHaveLength(2);
        expect(rules[0].values).toEqual(['2026-03-01']);
        expect(rules[1]).toEqual(
            getFilterRulesFromGroup(twoOnSameField.dimensions)[1],
        );
    });
});

import { FilterOperator, type FilterRule } from '@lightdash/common';
import Logger from '../../../../logging/logger';
import { mockOrdersExplore } from './validationExplore.mock';
import { validateFilterRules } from './validators';

const rule = (args: {
    id: string;
    fieldId: string;
    operator: FilterOperator;
    values?: unknown[];
}): FilterRule => ({
    id: args.id,
    target: { fieldId: args.fieldId },
    operator: args.operator,
    ...(args.values ? { values: args.values } : {}),
});

const getValidationMessage = (filterRule: FilterRule): string => {
    try {
        validateFilterRules(mockOrdersExplore, [filterRule]);
    } catch (error) {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }

    throw new Error('Expected filter validation to fail');
};

describe('validateFilterRules error messages', () => {
    beforeEach(() => {
        jest.spyOn(Logger, 'error').mockImplementation(() => Logger);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('explains invalid boolean filters with available combinations', () => {
        const message = getValidationMessage(
            rule({
                id: 'filter-boolean',
                fieldId: 'orders_is_active',
                operator: FilterOperator.GREATER_THAN,
                values: [true],
            }),
        );

        expect(message).toContain(
            'Invalid filter for field "orders_is_active" (Is Active).',
        );
        expect(message).toContain(
            '"greaterThan" is not available for boolean fields.',
        );
        expect(message).toContain(
            'For boolean fields, these are all available filter combinations:',
        );
        expect(message).toContain(
            '{"fieldId":"orders_is_active","fieldType":"boolean","fieldFilterType":"boolean","operator":"equals","values":[true]}',
        );
        expect(message).not.toContain('invalid_union');
        expect(message).not.toContain('ZodError');
    });

    it('explains invalid string filters with available combinations', () => {
        const message = getValidationMessage(
            rule({
                id: 'filter-string',
                fieldId: 'orders_customer_name',
                operator: FilterOperator.GREATER_THAN,
                values: ['Alice'],
            }),
        );

        expect(message).toContain(
            'Invalid filter for field "orders_customer_name" (Customer Name).',
        );
        expect(message).toContain(
            '"greaterThan" is not available for string fields.',
        );
        expect(message).toContain(
            'For string fields, these are all available filter combinations:',
        );
        expect(message).toContain(
            '{"fieldId":"orders_customer_name","fieldType":"string","fieldFilterType":"string","operator":"include","values":["@lightdash.com"]}',
        );
        expect(message).not.toContain('invalid_union');
        expect(message).not.toContain('ZodError');
    });

    it('explains invalid number filters with available combinations', () => {
        const message = getValidationMessage(
            rule({
                id: 'filter-number',
                fieldId: 'orders_amount',
                operator: FilterOperator.GREATER_THAN,
                values: ['100'],
            }),
        );

        expect(message).toContain(
            'Invalid filter for field "orders_amount" (Amount).',
        );
        expect(message).toContain(
            '"greaterThan" is a valid number operator, but values must be an array with exactly one number. Received ["100"].',
        );
        expect(message).toContain(
            'For number fields, these are all available filter combinations:',
        );
        expect(message).toContain(
            '{"fieldId":"orders_amount","fieldType":"number","fieldFilterType":"number","operator":"greaterThan","values":[100]}',
        );
        expect(message).not.toContain('invalid_union');
        expect(message).not.toContain('ZodError');
    });

    it('explains invalid date filters with available combinations', () => {
        const message = getValidationMessage(
            rule({
                id: 'filter-date',
                fieldId: 'orders_order_date',
                operator: FilterOperator.EQUALS,
                values: ['last 2 weeks'],
            }),
        );

        expect(message).toContain(
            'Invalid filter for field "orders_order_date" (Order Date).',
        );
        expect(message).toContain(
            '"equals" is a valid date operator, but values must be ISO date/datetime strings. Received ["last 2 weeks"].',
        );
        expect(message).toContain(
            'For date fields, these are all available filter combinations:',
        );
        expect(message).toContain(
            '{"fieldId":"orders_order_date","fieldType":"date","fieldFilterType":"date","operator":"inThePast","values":[2],"settings":{"completed":false,"unitOfTime":"weeks"}}',
        );
        expect(message).not.toContain('invalid_union');
        expect(message).not.toContain('ZodError');
    });
});

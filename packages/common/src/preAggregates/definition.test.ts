import { ParseError } from '../types/errors';
import { FilterOperator, UnitOfTime } from '../types/filter';
import { TimeFrames } from '../types/timeFrames';
import { parseDbtPreAggregateDef, parseDbtPreAggregates } from './definition';

describe('parseDbtPreAggregateDef', () => {
    const basePreAggregate = {
        name: 'orders_rollup',
        dimensions: ['order_date'],
        metrics: ['order_count'],
    };

    it('parses canonical materialization sorts in order', () => {
        expect(
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    sorts: [
                        {
                            fieldId: ' orders_order_date_day ',
                            descending: true,
                        },
                        { fieldId: 'orders_status', descending: false },
                    ],
                },
                'orders',
            ),
        ).toEqual({
            ...basePreAggregate,
            sorts: [
                {
                    fieldId: 'orders_order_date_day',
                    descending: true,
                },
                { fieldId: 'orders_status', descending: false },
            ],
        });
    });

    it.each([
        'analytics.orders_rollup_mv',
        '"analytics"."orders rollup"',
        '`project-id.analytics.orders_rollup_mv`',
    ])('parses and trims external table %s', (table) => {
        expect(
            parseDbtPreAggregateDef(
                { ...basePreAggregate, table: `  ${table}  ` },
                'orders',
            ),
        ).toEqual({
            ...basePreAggregate,
            table,
        });
    });

    it('omits table when not configured (managed pre-aggregate)', () => {
        expect(
            parseDbtPreAggregateDef(basePreAggregate, 'orders'),
        ).not.toHaveProperty('table');
    });

    it.each([
        { name: 'an empty string', table: '' },
        { name: 'a whitespace-only string', table: '   ' },
        { name: 'a non-string value', table: 42 },
        { name: 'a SQL expression', table: '(SELECT * FROM orders)' },
        { name: 'multiple statements', table: 'orders; DROP TABLE users' },
        { name: 'a SQL comment', table: 'orders -- injected' },
    ])('throws when table is $name', ({ table }) => {
        expect(() =>
            parseDbtPreAggregateDef({ ...basePreAggregate, table }, 'orders'),
        ).toThrow(ParseError);
    });

    it('omits materialization sorts when they are not configured', () => {
        expect(
            parseDbtPreAggregateDef(basePreAggregate, 'orders'),
        ).not.toHaveProperty('sorts');
    });

    it.each([
        { name: 'false', sorts: false },
        { name: 'an empty array', sorts: [] },
    ])('normalizes $name to disabled materialization sorts', ({ sorts }) => {
        expect(
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    sorts,
                },
                'orders',
            ),
        ).toHaveProperty('sorts', []);
    });

    it.each([
        {
            name: 'true',
            sorts: true,
            message: 'Expected an array of sort entries, or false / []',
        },
        {
            name: 'null',
            sorts: null,
            message: 'Expected an array of sort entries, or false / []',
        },
        {
            name: 'a non-object entry',
            sorts: [null],
            message: 'Expected an object',
        },
        {
            name: 'the old field key',
            sorts: [{ field: 'order_date', descending: true }],
            message: 'has unsupported "sorts" fields: field',
        },
        {
            name: 'a missing fieldId',
            sorts: [{ descending: false }],
            message: '"fieldId" must be a non-empty string',
        },
        {
            name: 'an empty fieldId',
            sorts: [{ fieldId: '', descending: false }],
            message: '"fieldId" must be a non-empty string',
        },
        {
            name: 'a blank fieldId after normalization',
            sorts: [{ fieldId: '   ', descending: false }],
            message: '"fieldId" must be a non-empty string',
        },
        {
            name: 'a missing direction',
            sorts: [{ fieldId: 'orders_order_date_day' }],
            message: '"descending" is required',
        },
        {
            name: 'an invalid direction',
            sorts: [
                {
                    fieldId: 'orders_order_date_day',
                    descending: 'yes',
                },
            ],
            message: '"descending" must be a boolean',
        },
        {
            name: 'a misspelled direction',
            sorts: [
                {
                    fieldId: 'orders_order_date_day',
                    descending: true,
                    desceding: false,
                },
            ],
            message: 'has unsupported "sorts" fields: desceding',
        },
        {
            name: 'unsupported null ordering',
            sorts: [
                {
                    fieldId: 'orders_order_date_day',
                    descending: true,
                    nulls_first: true,
                },
            ],
            message: 'has unsupported "sorts" fields: nulls_first',
        },
        {
            name: 'a duplicate normalized fieldId',
            sorts: [
                { fieldId: 'orders_status', descending: false },
                { fieldId: ' orders_status ', descending: true },
            ],
            message: 'has duplicate "sorts" fieldId "orders_status"',
        },
    ])('rejects $name in materialization sorts', ({ sorts, message }) => {
        expect(() =>
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    sorts,
                },
                'orders',
            ),
        ).toThrow(message);
    });

    it('parses materialization_role and normalizes scalar attributes to arrays', () => {
        const result = parseDbtPreAggregateDef(
            {
                ...basePreAggregate,
                materialization_role: {
                    email: 'materialize@acme.com',
                    attributes: {
                        is_admin: 'true',
                        allowed_regions: ['EMEA', 'APAC'],
                    },
                },
            },
            'orders',
        );

        expect(result).toEqual({
            ...basePreAggregate,
            materializationRole: {
                email: 'materialize@acme.com',
                attributes: {
                    is_admin: ['true'],
                    allowed_regions: ['EMEA', 'APAC'],
                },
            },
        });
    });

    it('preserves other pre-aggregate properties when materialization_role is defined', () => {
        const result = parseDbtPreAggregateDef(
            {
                ...basePreAggregate,
                time_dimension: 'order_date',
                granularity: 'day',
                max_rows: 100,
                refresh: {
                    cron: '0 0 * * *',
                },
                materialization_role: {
                    email: 'materialize@acme.com',
                    attributes: {
                        region: ['EMEA'],
                    },
                },
            },
            'orders',
        );

        expect(result).toEqual({
            ...basePreAggregate,
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
            maxRows: 100,
            refresh: {
                cron: '0 0 * * *',
            },
            materializationRole: {
                email: 'materialize@acme.com',
                attributes: {
                    region: ['EMEA'],
                },
            },
        });
    });

    it('throws when materialization_role.email is missing', () => {
        expect(() =>
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    materialization_role: {
                        attributes: {
                            region: 'EMEA',
                        },
                    },
                },
                'orders',
            ),
        ).toThrow(ParseError);
    });

    it('throws when materialization_role.attributes is missing', () => {
        expect(() =>
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    materialization_role: {
                        email: 'materialize@acme.com',
                    },
                },
                'orders',
            ),
        ).toThrow(ParseError);
    });

    it('throws when a materialization_role attribute value has an invalid type', () => {
        expect(() =>
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    materialization_role: {
                        email: 'materialize@acme.com',
                        attributes: {
                            region: 123,
                        },
                    },
                },
                'orders',
            ),
        ).toThrow(ParseError);
    });

    it('throws when materialization_role has unsupported intrinsic fields', () => {
        expect(() =>
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    materialization_role: {
                        email: 'materialize@acme.com',
                        user_id: '123',
                        attributes: {
                            region: 'EMEA',
                        },
                    },
                },
                'orders',
            ),
        ).toThrow(ParseError);
    });

    it('parses pre-aggregate filters using the shared filter grammar', () => {
        expect(
            parseDbtPreAggregateDef(
                {
                    name: 'orders_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                    time_dimension: 'order_date',
                    granularity: 'day',
                    filters: [
                        { order_date: 'inThePast 3 days' },
                        { status: 'completed' },
                    ],
                },
                'orders',
            ),
        ).toStrictEqual({
            name: 'orders_rollup',
            dimensions: ['status'],
            metrics: ['order_count'],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
            filters: [
                {
                    id: expect.any(String),
                    target: { fieldRef: 'order_date' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [3],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                    },
                },
                {
                    id: expect.any(String),
                    target: { fieldRef: 'status' },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ],
        });
    });

    it('throws when pre-aggregate filters use invalid filter grammar', () => {
        expect(() =>
            parseDbtPreAggregates(
                [
                    {
                        name: 'orders_rollup',
                        dimensions: ['status'],
                        metrics: ['order_count'],
                        filters: [{ order_date: '"unterminated' }],
                    },
                ],
                'orders',
            ),
        ).toThrow();
    });
});

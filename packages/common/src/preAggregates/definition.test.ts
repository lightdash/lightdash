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

    it('parses materialization sorts in order and defaults to ascending', () => {
        expect(
            parseDbtPreAggregateDef(
                {
                    ...basePreAggregate,
                    sorts: [
                        { field: ' order_date ', descending: true },
                        { field: 'status' },
                    ],
                },
                'orders',
            ),
        ).toEqual({
            ...basePreAggregate,
            sorts: [
                { field: 'order_date', descending: true },
                { field: 'status', descending: false },
            ],
        });
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
            name: 'empty field',
            sorts: [{ field: '' }],
            message: '"field" must be a non-empty string',
        },
        {
            name: 'invalid direction',
            sorts: [{ field: 'order_date', descending: 'yes' }],
            message: '"descending" must be a boolean',
        },
        {
            name: 'unsupported field',
            sorts: [{ field: 'order_date', nulls_first: true }],
            message: 'has unsupported "sorts" fields: nulls_first',
        },
        {
            name: 'duplicate field',
            sorts: [{ field: 'order_date' }, { field: ' order_date ' }],
            message: 'has duplicate "sorts" field "order_date"',
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

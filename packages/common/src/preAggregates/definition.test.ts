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

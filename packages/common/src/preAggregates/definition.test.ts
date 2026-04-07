import { ParseError } from '../types/errors';
import { TimeFrames } from '../types/timeFrames';
import { parseDbtPreAggregateDef } from './definition';

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
});

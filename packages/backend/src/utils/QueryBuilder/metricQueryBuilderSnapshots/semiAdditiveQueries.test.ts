import { CompileError, SemiAdditiveAggregation } from '@lightdash/common';
import { MetricQueryBuilder } from '../MetricQueryBuilder';
import {
    EXPLORE_WITH_SEMI_ADDITIVE,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY_SEMI_ADDITIVE_MONTHLY,
    METRIC_QUERY_SEMI_ADDITIVE_NO_DIMS,
    METRIC_QUERY_SEMI_ADDITIVE_WITH_DIMS,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: semi-additive queries', () => {
    test('matches snapshot for a semi-additive last metric with account + date dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SEMI_ADDITIVE,
                compiledMetricQuery: METRIC_QUERY_SEMI_ADDITIVE_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });

    test('matches snapshot for a semi-additive last metric with only date dimension', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SEMI_ADDITIVE,
                compiledMetricQuery: METRIC_QUERY_SEMI_ADDITIVE_NO_DIMS,
            }),
        ).toMatchSnapshot();
    });

    test('matches snapshot for a semi-additive last metric with monthly time grain', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SEMI_ADDITIVE,
                compiledMetricQuery: METRIC_QUERY_SEMI_ADDITIVE_MONTHLY,
            }),
        ).toMatchSnapshot();
    });

    test('throws when the time dimension is not selected', () => {
        expect(() =>
            buildQuery({
                explore: EXPLORE_WITH_SEMI_ADDITIVE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_SEMI_ADDITIVE_WITH_DIMS,
                    dimensions: ['daily_balances_account'],
                },
            }),
        ).toThrow(CompileError);
    });

    test('throws when the time dimension does not exist in the explore', () => {
        const badExplore = {
            ...EXPLORE_WITH_SEMI_ADDITIVE,
            tables: {
                daily_balances: {
                    ...EXPLORE_WITH_SEMI_ADDITIVE.tables.daily_balances,
                    metrics: {
                        total_balance: {
                            ...EXPLORE_WITH_SEMI_ADDITIVE.tables.daily_balances
                                .metrics.total_balance,
                            semiAdditive: {
                                timeDimension: 'nonexistent_dim',
                                aggregation: SemiAdditiveAggregation.LAST,
                            },
                        },
                    },
                },
            },
        };

        expect(() =>
            new MetricQueryBuilder({
                explore: badExplore,
                compiledMetricQuery: METRIC_QUERY_SEMI_ADDITIVE_WITH_DIMS,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                parameterDefinitions: {},
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).compileQuery(),
        ).toThrow(/does not exist in table/);
    });
});

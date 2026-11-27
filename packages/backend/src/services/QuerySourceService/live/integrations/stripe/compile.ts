import {
    type Explore,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileLiveSqlQuery, type LiveCompiledRequest } from '../../sdk';

/**
 * Compiles a metric query on a Stripe explore into one SQL query for the
 * Queries API, in the Trino dialect it runs. Stripe's timestamps are UTC.
 * Without a date filter it reads the explore's last `defaultDays`.
 */
export const compileStripeQuery = ({
    explore,
    metricQuery,
    warehouseSqlBuilder,
}: {
    explore: Explore;
    metricQuery: MetricQuery;
    warehouseSqlBuilder: WarehouseSqlBuilder;
}): LiveCompiledRequest =>
    compileLiveSqlQuery({
        explore,
        metricQuery,
        warehouseSqlBuilder,
        timezone: 'UTC',
    });

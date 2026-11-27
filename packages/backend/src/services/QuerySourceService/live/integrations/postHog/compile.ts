import {
    type Explore,
    type MetricQuery,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { compileLiveSqlQuery, type LiveCompiledRequest } from '../../sdk';

/**
 * Compiles a metric query on a PostHog explore into one HogQL query, with
 * the ClickHouse dialect HogQL is built on. Without a date filter it reads
 * the last `defaultDays`, so a question never scans the whole event history.
 */
export const compilePostHogQuery = (args: {
    explore: Explore;
    metricQuery: MetricQuery;
    warehouseSqlBuilder: WarehouseSqlBuilder;
    timezone: string;
}): LiveCompiledRequest => compileLiveSqlQuery(args);

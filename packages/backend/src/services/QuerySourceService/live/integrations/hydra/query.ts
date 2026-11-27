import { ApiConnectorType, UnexpectedServerError } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveLimits,
    type LiveQuery,
} from '../../sdk';
import { compileHydraQuery } from './compile';
import { HYDRA_DATE_FILTERS, HYDRA_STRING_FILTERS } from './model';
import { parseHydraRequest, type HydraRequest } from './report';
import { HYDRA_MAX_QUERY_ROWS, runHydraQuery } from './run';

// Hydra calls nothing, so its limits only cap how many rows a query reads
const LIMITS: LiveLimits = {
    timeoutMs: 30_000,
    maxRows: HYDRA_MAX_QUERY_ROWS,
    concurrentCalls: 1,
    callsPerSecond: null,
    buckets: [],
};

export const hydraQuery: LiveQuery<ApiConnectorType.HYDRA, HydraRequest> = {
    request: parseHydraRequest,
    compile: ({ explore, metricQuery, now }) =>
        compileHydraQuery({
            explore,
            metricQuery,
            today: getIsoDateInTimeZone(now, 'UTC'),
        }),
    run: runHydraQuery,
    // Never reached: no call is made
    toError: (response) =>
        new UnexpectedServerError(`Hydra returned ${response.status}`),
    // One AND of report filters, each keeping or dropping a list of values.
    // Events are read over one range of UTC days.
    capabilities: {
        filters: {
            operators: {
                string: HYDRA_STRING_FILTERS,
                date: HYDRA_DATE_FILTERS,
            },
            multipleValues: true,
            or: false,
            nestedGroups: false,
        },
        metricFilters: false,
        dates: {
            rangeRequired: true,
            operators: HYDRA_DATE_FILTERS,
            grains: [],
            timezone: 'fixed',
        },
        pushdown: ALL_PUSHDOWN_REFUSED,
    },
    limits: LIMITS,
};

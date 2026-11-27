import { ApiConnectorType, HYDRA_DEFAULT_SOURCE } from '@lightdash/common';
import {
    ALL_PUSHDOWN_REFUSED,
    getIsoDateInTimeZone,
    type LiveLimits,
    type LiveQuery,
} from '../../sdk';
import { toHydraError } from './api';
import { compileHydraQuery } from './compile';
import { getHydraDeclaredLimits } from './fake/declaredLimits';
import { parseHydraRequest, type HydraRequest } from './fake/report';
import { HYDRA_DATE_FILTERS, HYDRA_STRING_FILTERS } from './model';
import { HYDRA_MAX_QUERY_ROWS, runHydraQuery } from './run';

const LIMITS: LiveLimits = {
    timeoutMs: 30_000,
    maxRows: HYDRA_MAX_QUERY_ROWS,
    // Enough pages for the row cap at the smallest page size, 10
    callsPerQuery: 51,
    ...getHydraDeclaredLimits(HYDRA_DEFAULT_SOURCE),
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
    toError: (response) => toHydraError(response),
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
    limitsFor: (settings) => ({
        ...LIMITS,
        ...getHydraDeclaredLimits(settings),
    }),
};

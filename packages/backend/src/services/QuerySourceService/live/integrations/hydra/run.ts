import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    withHydraDefaults,
    type HydraApiSource,
} from '@lightdash/common';
import { assertMaxRows, type LiveRunArgs, type LiveRunResult } from '../../sdk';
import { buildHydraDataset, type HydraDataset } from './fake/data';
import {
    HYDRA_REPORTS,
    isHydraObjectRequest,
    runHydraReport,
    type HydraRequest,
} from './fake/report';
import {
    buildHydraObjectRecords,
    HYDRA_RECORD_COUNT,
    listHydraObjects,
    runHydraObjectReport,
} from './objects';

/** The most rows one query returns, kept small so tests reach it. */
export const HYDRA_MAX_QUERY_ROWS = 500;

/** Every source seeds from the same word, so its rows are the same everywhere. */
const HYDRA_SEED = 'hydra';

type HydraRow = Record<string, string | number>;

// The last dataset built: seeding a large one for every query would be slow
let lastDataset: { key: string; dataset: HydraDataset } | null = null;

const getDataset = (rowCount: number, today: string): HydraDataset => {
    const key = `${rowCount}:${today}`;
    if (lastDataset?.key !== key) {
        lastDataset = {
            key,
            dataset: buildHydraDataset({ token: HYDRA_SEED, rowCount, today }),
        };
    }
    return lastDataset.dataset;
};

/** Every row of a report, from the rows Hydra seeds. */
const readRows = (
    settings: HydraApiSource,
    request: HydraRequest,
    today: string,
): HydraRow[] => {
    const { rowCount, objects } = withHydraDefaults(settings);
    if (!isHydraObjectRequest(request)) {
        return runHydraReport(getDataset(rowCount, today), request);
    }
    const object = objects.find(({ id }) => id === request.object);
    if (!object) {
        throw new ParameterError(`Hydra has no object ${request.object}`);
    }
    const [listed] = listHydraObjects([object]).objects;
    const fieldIds = listed.fields.map(({ id }) => id);
    const unknown = [
        ...request.dimensions,
        ...request.filters.map(({ field }) => field),
        ...request.orderBy
            .map(({ field }) => field)
            .filter((field) => field !== HYDRA_RECORD_COUNT),
    ].filter((field) => !fieldIds.includes(field));
    if (unknown.length > 0) {
        throw new ParameterError(
            `${request.object} has no field ${unknown.join(', ')}`,
        );
    }
    return runHydraObjectReport(
        buildHydraObjectRecords({ token: HYDRA_SEED, object, today }),
        request,
    );
};

/**
 * Runs one Hydra report from the rows Hydra seeds. Nothing is called:
 * Hydra has no vendor behind it.
 */
export const runHydraQuery = async ({
    settings,
    request,
    limit,
}: LiveRunArgs<
    ApiConnectorType.HYDRA,
    HydraRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, HYDRA_MAX_QUERY_ROWS);
    const rowLimit = Math.min(limit, request.limit ?? limit);
    const rows = readRows(
        settings,
        request,
        new Date().toISOString().slice(0, 10),
    );
    const dates: readonly string[] = isHydraObjectRequest(request)
        ? []
        : HYDRA_REPORTS[request.report].dates;
    return {
        // An object's column types come from its explore's fields
        columns: [
            ...request.dimensions.map((name) => ({
                name,
                type: dates.includes(name)
                    ? DimensionType.DATE
                    : DimensionType.STRING,
            })),
            ...request.metrics.map((name) => ({
                name,
                type: DimensionType.NUMBER,
            })),
        ],
        rows: rows.slice(0, rowLimit),
        hasMoreRows: rows.length > rowLimit,
    };
};

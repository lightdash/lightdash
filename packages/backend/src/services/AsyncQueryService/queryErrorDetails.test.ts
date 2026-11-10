import {
    MissingWarehouseCredentialsError,
    QueryCostEstimateExceededError,
    WarehouseQueryError,
} from '@lightdash/common';
import { withDuckdbErrorPhase } from '@lightdash/warehouses';
import { PythonExecutionError } from './python/PythonSandboxRunner';
import { getQueryErrorDetails } from './queryErrorDetails';

const duckdbError = (phase: 'parse' | 'bind' | 'runtime') =>
    withDuckdbErrorPhase(phase, async () => {
        throw new Error('Binder Error: column not found');
    }).catch((e: unknown) => e);

describe('getQueryErrorDetails', () => {
    it.each(['parse', 'bind', 'runtime'] as const)(
        'classifies a DuckDB %s failure by phase',
        async (phase) => {
            expect(getQueryErrorDetails(await duckdbError(phase))).toEqual({
                code: `duckdb_${phase}`,
                pythonExceptionType: null,
            });
        },
    );

    it('keeps the python stage and exception class', () => {
        expect(
            getQueryErrorDetails(
                new PythonExecutionError('run() raised', {
                    stage: 'run',
                    exceptionType: 'KeyError',
                }),
            ),
        ).toEqual({ code: 'python_run', pythonExceptionType: 'KeyError' });
    });

    it.each([
        ['bytesBilledLimitExceeded', 'bigquery_bytes_billed_limit'],
        ['someNewReason', 'bigquery_other'],
    ])('maps BigQuery reason %s', (bigqueryReason, code) => {
        expect(
            getQueryErrorDetails(
                new WarehouseQueryError('failed', { bigqueryReason }),
            ).code,
        ).toBe(code);
    });

    it.each([
        [
            new QueryCostEstimateExceededError('too big', {
                estimatedBytes: 2,
                limitBytes: 1,
            }),
            'query_cost_estimate_exceeded',
        ],
        [
            new MissingWarehouseCredentialsError('no creds'),
            'missing_warehouse_credentials',
        ],
        [new WarehouseQueryError('syntax error'), 'warehouse_other'],
        [new Error('boom'), 'unknown'],
    ])('classifies %s by class', (error, code) => {
        expect(getQueryErrorDetails(error).code).toBe(code);
    });

    it('follows the cause chain to the classified error', async () => {
        const wrapped = new Error('Query failed', {
            cause: await duckdbError('bind'),
        });
        expect(getQueryErrorDetails(wrapped).code).toBe('duckdb_bind');
    });

    it('prefers a specific cause over a generic warehouse wrapper', async () => {
        const wrapped = Object.assign(new WarehouseQueryError('Parser Error'), {
            cause: await duckdbError('parse'),
        });
        expect(getQueryErrorDetails(wrapped).code).toBe('duckdb_parse');
        expect(getQueryErrorDetails(new WarehouseQueryError('x')).code).toBe(
            'warehouse_other',
        );
    });
});

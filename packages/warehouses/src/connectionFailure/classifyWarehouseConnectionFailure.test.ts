import {
    WarehouseConnectionError,
    WarehouseConnectionFailureCause,
    WarehouseQueryError,
    WarehouseTypes,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { classifyWarehouseConnectionFailure } from './classifyWarehouseConnectionFailure';

const nodeError = (code: string, message = code) =>
    Object.assign(new Error(message), { code });

const queryError = (driverCode: string | null, message = 'failed') =>
    new WarehouseQueryError(message, { driverCode });

const connectionError = (driverCode: string | null, message = 'failed') =>
    new WarehouseConnectionError(message, { driverCode });

describe('classifyWarehouseConnectionFailure', () => {
    it.each([
        [queryError('28P01'), WarehouseConnectionFailureCause.CREDENTIALS],
        [
            queryError('3D000'),
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
        [
            queryError('42501'),
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
        [queryError('ECONNREFUSED'), WarehouseConnectionFailureCause.NETWORK],
        [queryError('ENOTFOUND'), WarehouseConnectionFailureCause.NETWORK],
        [queryError('ETIMEDOUT'), WarehouseConnectionFailureCause.TIMEOUT],
        [
            queryError('SELF_SIGNED_CERT_IN_CHAIN'),
            WarehouseConnectionFailureCause.TLS,
        ],
        [
            new Error('timeout exceeded when trying to connect'),
            WarehouseConnectionFailureCause.TIMEOUT,
        ],
        [
            new Error('The server does not support SSL connections'),
            WarehouseConnectionFailureCause.TLS,
        ],
        [
            queryError(
                '28000',
                'no pg_hba.conf entry for host "1.2.3.4", user "x", database "y", no encryption',
            ),
            WarehouseConnectionFailureCause.TLS,
        ],
        [
            queryError(
                '28000',
                'no pg_hba.conf entry for host "1.2.3.4", user "x", database "y", SSL encryption',
            ),
            WarehouseConnectionFailureCause.NETWORK,
        ],
    ])('maps Postgres %o', (error, cause) => {
        expect(
            classifyWarehouseConnectionFailure(WarehouseTypes.POSTGRES, error)
                .cause,
        ).toBe(cause);
    });

    it('maps a port out of range to input format', () => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.POSTGRES,
                nodeError('ERR_SOCKET_BAD_PORT', 'Port should be >= 0'),
            ).cause,
        ).toBe(WarehouseConnectionFailureCause.INPUT_FORMAT);
    });

    it('uses the Postgres rules for Redshift', () => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.REDSHIFT,
                queryError('28P01'),
            ),
        ).toEqual({
            cause: WarehouseConnectionFailureCause.CREDENTIALS,
            driverCode: '28P01',
        });
    });

    it.each([
        ['250001', WarehouseConnectionFailureCause.CREDENTIALS],
        ['390144', WarehouseConnectionFailureCause.CREDENTIALS],
        ['390422', WarehouseConnectionFailureCause.NETWORK],
        ['ENOTFOUND', WarehouseConnectionFailureCause.INPUT_FORMAT],
    ])('maps Snowflake code %s', (code, cause) => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.SNOWFLAKE,
                connectionError(code, `Snowflake error: ${code}`),
            ).cause,
        ).toBe(cause);
    });

    it('maps a Snowflake warehouse that does not exist to a missing object', () => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.SNOWFLAKE,
                connectionError(
                    '002043',
                    'Failed to select Snowflake warehouse "WH": Object does not exist, or operation cannot be performed. warehouse not authorized',
                ),
            ).cause,
        ).toBe(WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT);
    });

    it.each([
        ['516', WarehouseConnectionFailureCause.CREDENTIALS],
        ['81', WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT],
        ['497', WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT],
        ['195', WarehouseConnectionFailureCause.NETWORK],
        ['host_includes_scheme', WarehouseConnectionFailureCause.INPUT_FORMAT],
        ['ECONNREFUSED', WarehouseConnectionFailureCause.NETWORK],
    ])('maps ClickHouse code %s', (code, cause) => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.CLICKHOUSE,
                connectionError(code),
            ).cause,
        ).toBe(cause);
    });

    it.each([
        [
            'accessDenied',
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
        ['notFound', WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT],
        ['invalid_grant', WarehouseConnectionFailureCause.CREDENTIALS],
        ['invalid', WarehouseConnectionFailureCause.INPUT_FORMAT],
    ])('maps BigQuery reason %s', (reason, cause) => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.BIGQUERY,
                queryError(reason),
            ).cause,
        ).toBe(cause);
    });

    it.each([
        [
            'UnrecognizedClientException',
            WarehouseConnectionFailureCause.CREDENTIALS,
        ],
        ['http_401', WarehouseConnectionFailureCause.CREDENTIALS],
        [
            'AccessDeniedException',
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
        [
            'InvalidRequestException',
            WarehouseConnectionFailureCause.INPUT_FORMAT,
        ],
    ])('maps Athena error name %s', (name, cause) => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.ATHENA,
                connectionError(name),
            ).cause,
        ).toBe(cause);
    });

    it.each([
        [
            'Request failed with status code 401',
            WarehouseConnectionFailureCause.CREDENTIALS,
        ],
        [
            'Request failed with status code 403',
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
        [
            'Request failed with status code 404',
            WarehouseConnectionFailureCause.INPUT_FORMAT,
        ],
        [
            '[SCHEMA_NOT_FOUND] The schema `x` cannot be found.',
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
    ])('maps Databricks message %s', (message, cause) => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.DATABRICKS,
                connectionError(null, message),
            ).cause,
        ).toBe(cause);
    });

    it('maps a Trino refused connection by its errno', () => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.TRINO,
                nodeError('ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.1:8080'),
            ),
        ).toEqual({
            cause: WarehouseConnectionFailureCause.NETWORK,
            driverCode: 'ECONNREFUSED',
        });
    });

    it.each([
        [
            'Invalid MotherDuck token',
            WarehouseConnectionFailureCause.CREDENTIALS,
        ],
        [
            'Catalog Error: Table with name x does not exist!',
            WarehouseConnectionFailureCause.MISSING_GRANT_OR_OBJECT,
        ],
        [
            'Invalid Input Error: bad path',
            WarehouseConnectionFailureCause.INPUT_FORMAT,
        ],
    ])('maps DuckDB message %s', (message, cause) => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.DUCKDB,
                new Error(message),
            ).cause,
        ).toBe(cause);
    });

    it('maps an SSH tunnel failure to network with its stage', () => {
        const error = Object.assign(new Error('ssh failed'), {
            data: {
                stage: 'tcp',
                sshHost: 'bastion',
                sshPort: 22,
                sshUser: 'u',
                cause: 'refused',
            },
        });
        expect(
            classifyWarehouseConnectionFailure(WarehouseTypes.POSTGRES, error),
        ).toEqual({
            cause: WarehouseConnectionFailureCause.NETWORK,
            driverCode: 'ssh_tcp',
        });
    });

    it('falls back to other with the driver code kept', () => {
        expect(
            classifyWarehouseConnectionFailure(
                WarehouseTypes.POSTGRES,
                queryError('53300', 'too many connections'),
            ),
        ).toEqual({
            cause: WarehouseConnectionFailureCause.OTHER,
            driverCode: '53300',
        });
    });
});

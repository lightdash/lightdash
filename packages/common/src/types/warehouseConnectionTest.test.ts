import { describe, expect, it } from 'vitest';
import { WarehouseTypes, type CreateWarehouseCredentials } from './projects';
import { WarehouseConnectionFailureCause } from './warehouseConnectionFailure';
import {
    getWarehouseConnectionDocsUrl,
    getWarehouseGrantSuggestion,
    getWarehouseNetworkEndpoint,
    getWarehouseTestCapability,
    parseEgressIps,
} from './warehouseConnectionTest';

const credentials = (value: object) => value as CreateWarehouseCredentials;

describe('getWarehouseTestCapability', () => {
    it.each([
        [{ type: WarehouseTypes.POSTGRES }, { reachHost: true, tls: false }],
        [
            { type: WarehouseTypes.POSTGRES, useSshTunnel: true },
            { reachHost: false, tls: false },
        ],
        [
            { type: WarehouseTypes.CLICKHOUSE, secure: true },
            { reachHost: true, tls: true },
        ],
        [
            { type: WarehouseTypes.TRINO, http_scheme: 'http' },
            { reachHost: true, tls: false },
        ],
        [{ type: WarehouseTypes.SNOWFLAKE }, { reachHost: true, tls: true }],
        [{ type: WarehouseTypes.BIGQUERY }, { reachHost: false, tls: false }],
        [{ type: WarehouseTypes.ATHENA }, { reachHost: false, tls: false }],
        [{ type: WarehouseTypes.DUCKDB }, { reachHost: false, tls: false }],
    ])('records what %o can check separately', (value, expected) => {
        expect(getWarehouseTestCapability(credentials(value))).toEqual(
            expected,
        );
    });
});

describe('getWarehouseNetworkEndpoint', () => {
    it('uses the Snowflake access URL when one is set', () => {
        expect(
            getWarehouseNetworkEndpoint(
                credentials({
                    type: WarehouseTypes.SNOWFLAKE,
                    account: 'acct',
                    accessUrl:
                        'https://acct.privatelink.snowflakecomputing.com',
                }),
            ),
        ).toEqual({
            host: 'acct.privatelink.snowflakecomputing.com',
            port: 443,
        });
    });

    it('uses the Databricks server host name on port 443', () => {
        expect(
            getWarehouseNetworkEndpoint(
                credentials({
                    type: WarehouseTypes.DATABRICKS,
                    serverHostName: 'dbc-1.cloud.databricks.com',
                }),
            ),
        ).toEqual({ host: 'dbc-1.cloud.databricks.com', port: 443 });
    });
});

describe('getWarehouseGrantSuggestion', () => {
    it('quotes identifiers that contain quotes', () => {
        expect(
            getWarehouseGrantSuggestion(
                credentials({
                    type: WarehouseTypes.POSTGRES,
                    user: 'o"brien',
                }),
                'my"schema',
            )?.statements,
        ).toEqual([
            'GRANT USAGE ON SCHEMA "my""schema" TO "o""brien";',
            'GRANT SELECT ON ALL TABLES IN SCHEMA "my""schema" TO "o""brien";',
        ]);
    });

    it('uses a placeholder for a Snowflake role that is not set', () => {
        expect(
            getWarehouseGrantSuggestion(
                credentials({
                    type: WarehouseTypes.SNOWFLAKE,
                    database: 'DB',
                    warehouse: 'WH',
                }),
                'S',
            )?.statements[0],
        ).toBe('GRANT USAGE ON WAREHOUSE "WH" TO ROLE <your role>;');
    });

    it('explains BigQuery access in IAM terms', () => {
        expect(
            getWarehouseGrantSuggestion(
                credentials({ type: WarehouseTypes.BIGQUERY, project: 'p' }),
                'ds',
            ),
        ).toMatchObject({
            label: 'Likely fix',
            explanation: expect.stringContaining('BigQuery Data Viewer'),
        });
    });

    it('explains Athena access as an IAM policy with no SQL', () => {
        expect(
            getWarehouseGrantSuggestion(
                credentials({ type: WarehouseTypes.ATHENA }),
                'glue_db',
            ),
        ).toMatchObject({
            explanation: expect.stringContaining('IAM'),
            statements: [],
        });
    });

    it('has no suggestion for DuckDB', () => {
        expect(
            getWarehouseGrantSuggestion(
                credentials({ type: WarehouseTypes.DUCKDB }),
                'main',
            ),
        ).toBeNull();
    });
});

describe('parseEgressIps', () => {
    it('splits a configured list and ignores an empty value', () => {
        expect(parseEgressIps('35.1.1.1, 35.2.2.2 35.3.3.3')).toEqual([
            '35.1.1.1',
            '35.2.2.2',
            '35.3.3.3',
        ]);
        expect(parseEgressIps('')).toEqual([]);
        expect(parseEgressIps(undefined)).toEqual([]);
    });
});

describe('getWarehouseConnectionDocsUrl', () => {
    it('sends network failures to the allow-list section', () => {
        expect(
            getWarehouseConnectionDocsUrl(
                WarehouseTypes.POSTGRES,
                WarehouseConnectionFailureCause.TIMEOUT,
            ),
        ).toMatch(/#adding-lightdashs-static-ip-addresses-to-your-allow-list$/);
    });

    it('sends other failures to the warehouse section', () => {
        expect(
            getWarehouseConnectionDocsUrl(
                WarehouseTypes.SNOWFLAKE,
                WarehouseConnectionFailureCause.CREDENTIALS,
            ),
        ).toMatch(/#snowflake$/);
    });
});

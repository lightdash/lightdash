import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import * as gcpOAuth from '../../clients/Aws/gcpOAuth';
import { getDuckdbRuntimeConfig } from './getDuckdbRuntimeConfig';

describe('DuckDB GCP OAuth storage', () => {
    let server: Server;
    let endpoint: string;
    let token: string;
    let authorizationHeaders: (string | undefined)[];

    beforeEach(async () => {
        token = 'first-token';
        authorizationHeaders = [];
        server = createServer((request, response) => {
            authorizationHeaders.push(request.headers.authorization);
            if (request.headers.authorization !== `Bearer ${token}`) {
                response.writeHead(403).end();
                return;
            }
            const body = Buffer.from('{"value":42}\n');
            response.setHeader('Content-Length', body.length);
            response.end(request.method === 'HEAD' ? undefined : body);
        });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    it.each(['ephemeral', 'isolated', 'shared'] as const)(
        'authenticates S3 reads with refreshed Google tokens in %s sessions',
        async (session) => {
            vi.spyOn(gcpOAuth, 'getGcpAccessToken').mockImplementation(
                async () => token,
            );
            const s3Config = getDuckdbRuntimeConfig({
                endpoint,
                region: 'us-east4',
                bucket: 'results',
                authMode: 'gcp_oauth',
                forcePathStyle: true,
            })!;
            const client = DuckdbWarehouseClient.createForPreAggregate(
                { type: 'duckdb_s3', s3Config },
                {
                    ...(session === 'isolated'
                        ? { resourceLimits: { threads: 1 } }
                        : {}),
                    ...(session === 'shared'
                        ? { instanceCacheKey: `gcp-oauth-${endpoint}` }
                        : {}),
                },
            );

            await expect(
                client.runQuery(`SELECT (a.value + b.value)::INTEGER AS value
                    FROM read_json('s3://results/first.jsonl') a
                    JOIN read_json('s3://results/other.jsonl') b ON a.value = b.value`),
            ).resolves.toMatchObject({ rows: [{ value: 84 }] });
            expect(authorizationHeaders).toContain('Bearer first-token');

            token = 'refreshed-token';
            authorizationHeaders = [];
            await expect(
                client.runQuery(
                    "SELECT value::INTEGER AS value FROM read_json('s3://results/second.jsonl')",
                ),
            ).resolves.toMatchObject({ rows: [{ value: 42 }] });
            expect(authorizationHeaders.length).toBeGreaterThan(0);
            expect(
                authorizationHeaders.every(
                    (header) => header === 'Bearer refreshed-token',
                ),
            ).toBe(true);
        },
    );
});

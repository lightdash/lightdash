import { createClient } from '@clickhouse/client';
import {
    DimensionType,
    WarehouseTypes,
    type CreateClickhouseCredentials,
} from '@lightdash/common';
import { createServer, type Server } from 'http';
import { Readable } from 'stream';
import {
    ClickhouseSqlBuilder,
    ClickhouseTypes,
    ClickhouseWarehouseClient,
    convertDataTypeToDimensionType,
    getMaxOpenConnections,
} from './ClickhouseWarehouseClient';

vi.mock('@clickhouse/client', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@clickhouse/client')>()),
    createClient: vi.fn(() => ({
        query: vi.fn(async () => ({
            stream: () => Readable.from([], { objectMode: true }),
        })),
    })),
}));

describe('ClickhouseWarehouseClient result cache', () => {
    let server: Server | undefined;
    let realWarehouse: ClickhouseWarehouseClient | undefined;

    afterEach(async () => {
        await realWarehouse?.client.close();
        realWarehouse = undefined;
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server?.close((error) => (error ? reject(error) : resolve()));
            });
            server = undefined;
        }
    });
    const credentials: CreateClickhouseCredentials = {
        type: WarehouseTypes.CLICKHOUSE,
        host: 'localhost',
        port: 8123,
        user: 'default',
        password: 'password',
        schema: 'default',
        secure: false,
    };

    it.each([true, false, undefined])(
        'sets client-wide result caching for agent job controls %s',
        async (agentJobControls) => {
            const warehouse = new ClickhouseWarehouseClient(credentials, {
                agentJobControls,
            });
            const clientOptions = vi.mocked(createClient).mock.lastCall?.[0];
            if (agentJobControls) {
                expect(clientOptions?.clickhouse_settings).toEqual({
                    use_query_cache: 0,
                });
            } else {
                expect(clientOptions).not.toHaveProperty('clickhouse_settings');
            }
            await warehouse.streamQuery('SELECT 1', () => {}, {
                timezone: 'Europe/London',
                tags: { agent: 'true' },
            });
            expect(warehouse.client.query).toHaveBeenCalledWith(
                expect.objectContaining({
                    clickhouse_settings: {
                        session_timezone: 'Europe/London',
                        log_comment: JSON.stringify({ agent: 'true' }),
                    },
                }),
            );
        },
    );

    it('keeps the ClickHouse query cache off when an agent query adds tags and timezone', async () => {
        const requestUrls: URL[] = [];
        server = createServer((request, response) => {
            requestUrls.push(new URL(request.url ?? '/', 'http://127.0.0.1'));
            request.resume();
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end('["principal"]\n["String"]\n["ai_agents"]\n');
        });
        const listeningServer = server;
        await new Promise<void>((resolve, reject) => {
            listeningServer.once('error', reject);
            listeningServer.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Expected an ephemeral HTTP port');
        }
        const sdk =
            await vi.importActual<typeof import('@clickhouse/client')>(
                '@clickhouse/client',
            );
        vi.mocked(createClient).mockImplementationOnce(sdk.createClient);
        realWarehouse = new ClickhouseWarehouseClient(
            {
                ...credentials,
                host: '127.0.0.1',
                port: address.port,
                user: 'ai_agents',
            },
            { agentJobControls: true },
        );
        const result = await realWarehouse.runQuery(
            'SELECT currentUser() AS principal',
            { agent: 'true' },
            'Europe/London',
        );
        expect(result.rows).toEqual([{ principal: 'ai_agents' }]);
        expect(requestUrls).toHaveLength(1);
        expect(requestUrls[0].searchParams.get('use_query_cache')).toBe('0');
        expect(requestUrls[0].searchParams.get('session_timezone')).toBe(
            'Europe/London',
        );
        expect(requestUrls[0].searchParams.get('log_comment')).toBe(
            JSON.stringify({ agent: 'true' }),
        );
    });

    it.each(['516', '192', '164', '497'])(
        'preserves SDK error %s through query, catalog and connection wrappers',
        async (code) => {
            const warehouse = new ClickhouseWarehouseClient(credentials);
            const sdkError = Object.assign(
                new Error('Database rejected the request'),
                { code },
            );
            vi.mocked(warehouse.client.query).mockRejectedValue(sdkError);
            await expect(
                warehouse.runQuery('SELECT 1', {}),
            ).rejects.toMatchObject({
                name: 'WarehouseQueryError',
                cause: sdkError,
                data: {},
            });
            await expect(
                warehouse.getCatalog([
                    { database: '', schema: 'default', table: 'orders' },
                ]),
            ).rejects.toMatchObject({
                name: 'WarehouseQueryError',
                cause: { cause: sdkError },
                data: {},
            });
            await expect(warehouse.test()).rejects.toMatchObject({
                name: 'WarehouseConnectionError',
                cause: sdkError,
                data: {},
            });
        },
    );
});

describe('getMaxOpenConnections', () => {
    it('defaults to 10 when concurrency is unknown', () => {
        expect(getMaxOpenConnections()).toBe(10);
        expect(getMaxOpenConnections(NaN)).toBe(10);
    });

    it('matches the given concurrency when larger than the default', () => {
        expect(getMaxOpenConnections(100)).toBe(100);
    });

    it('never shrinks below the default', () => {
        expect(getMaxOpenConnections(1)).toBe(10);
    });
});

describe('ClickhouseSqlBuilder', () => {
    const builder = new ClickhouseSqlBuilder();

    it('builds arrays with [...] syntax, not ARRAY[...] which ClickHouse rejects', () => {
        expect(builder.buildArray(['1', '2', '3'])).toBe('[1, 2, 3]');
    });

    it('uses the native <=> operator for null-safe join keys', () => {
        expect(builder.getNullSafeEqualJoinSql('a."x"', 'b."x"')).toBe(
            'a."x" <=> b."x"',
        );
    });
});

describe('convertDataTypeToDimensionType', () => {
    // Plain types (no wrappers)
    it.each([
        [ClickhouseTypes.BOOL, DimensionType.BOOLEAN],
        [ClickhouseTypes.UINT8, DimensionType.NUMBER],
        [ClickhouseTypes.UINT16, DimensionType.NUMBER],
        [ClickhouseTypes.UINT32, DimensionType.NUMBER],
        [ClickhouseTypes.UINT64, DimensionType.NUMBER],
        [ClickhouseTypes.INT8, DimensionType.NUMBER],
        [ClickhouseTypes.INT16, DimensionType.NUMBER],
        [ClickhouseTypes.INT32, DimensionType.NUMBER],
        [ClickhouseTypes.INT64, DimensionType.NUMBER],
        [ClickhouseTypes.FLOAT32, DimensionType.NUMBER],
        [ClickhouseTypes.FLOAT64, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL32, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL64, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL128, DimensionType.NUMBER],
        [ClickhouseTypes.DECIMAL256, DimensionType.NUMBER],
        [ClickhouseTypes.DATE, DimensionType.DATE],
        [ClickhouseTypes.DATE32, DimensionType.DATE],
        [ClickhouseTypes.DATETIME, DimensionType.TIMESTAMP],
        [ClickhouseTypes.DATETIME64, DimensionType.TIMESTAMP],
        [ClickhouseTypes.STRING, DimensionType.STRING],
        [ClickhouseTypes.FIXEDSTRING, DimensionType.STRING],
        [ClickhouseTypes.UUID, DimensionType.STRING],
        [ClickhouseTypes.IPV4, DimensionType.STRING],
        [ClickhouseTypes.IPV6, DimensionType.STRING],
    ])('maps plain type %s to %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Nullable wrapper
    it.each([
        ['Nullable(Int32)', DimensionType.NUMBER],
        ['Nullable(Float64)', DimensionType.NUMBER],
        ['Nullable(Date)', DimensionType.DATE],
        ['Nullable(DateTime)', DimensionType.TIMESTAMP],
        ['Nullable(String)', DimensionType.STRING],
        ['Nullable(Bool)', DimensionType.BOOLEAN],
    ])('unwraps Nullable: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // LowCardinality wrapper
    it.each([
        ['LowCardinality(String)', DimensionType.STRING],
        ['LowCardinality(Int32)', DimensionType.NUMBER],
        ['LowCardinality(Date)', DimensionType.DATE],
        ['LowCardinality(DateTime)', DimensionType.TIMESTAMP],
    ])('unwraps LowCardinality: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Nested wrappers (the main bug fix)
    it.each([
        ['LowCardinality(Nullable(Int32))', DimensionType.NUMBER],
        ['LowCardinality(Nullable(Float64))', DimensionType.NUMBER],
        ['LowCardinality(Nullable(Date))', DimensionType.DATE],
        ['LowCardinality(Nullable(DateTime))', DimensionType.TIMESTAMP],
        ['LowCardinality(Nullable(String))', DimensionType.STRING],
        ['Nullable(LowCardinality(Int32))', DimensionType.NUMBER],
    ])('unwraps nested wrappers: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Multi-argument precision types (the second bug fix)
    it.each([
        ['Decimal(18, 2)', DimensionType.NUMBER],
        ['Decimal(10, 4)', DimensionType.NUMBER],
        ['Decimal32(9)', DimensionType.NUMBER],
        ['Decimal64(18)', DimensionType.NUMBER],
        ['Decimal128(38)', DimensionType.NUMBER],
        ['Decimal256(76)', DimensionType.NUMBER],
        ["DateTime64(3, 'UTC')", DimensionType.TIMESTAMP],
        ["DateTime64(6, 'Europe/London')", DimensionType.TIMESTAMP],
        ['DateTime64(3)', DimensionType.TIMESTAMP],
        ['FixedString(16)', DimensionType.STRING],
    ])('strips precision/scale arguments: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Combined: nested wrappers + precision arguments
    it.each([
        ['Nullable(Decimal(18, 2))', DimensionType.NUMBER],
        ["Nullable(DateTime64(3, 'UTC'))", DimensionType.TIMESTAMP],
        ['LowCardinality(Nullable(FixedString(16)))', DimensionType.STRING],
    ])('handles wrappers + precision combined: %s -> %s', (input, expected) => {
        expect(convertDataTypeToDimensionType(input)).toBe(expected);
    });

    // Unknown types fall through to STRING
    it('returns STRING for unknown types', () => {
        expect(convertDataTypeToDimensionType('SomeFutureType')).toBe(
            DimensionType.STRING,
        );
    });
});

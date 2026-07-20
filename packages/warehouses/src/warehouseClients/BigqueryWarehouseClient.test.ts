import {
    BigQuery,
    Dataset,
    type DatasetsResponse,
    type QueryRowsResponse,
} from '@google-cloud/bigquery';
import { type BigqueryProject } from '@lightdash/common';
import type { Mock, MockInstance } from 'vitest';
import {
    BigquerySqlBuilder,
    BigqueryWarehouseClient,
} from './BigqueryWarehouseClient';
import {
    createJobResponse,
    credentials,
    getTableResponse,
} from './BigqueryWarehouseClient.mock';
import {
    config,
    expectedFieldsWithAwareTimestamp,
    expectedRow,
    expectedWarehouseSchemaWithAwareTimestamp,
} from './WarehouseClient.mock';

describe('BigqueryWarehouseClient', () => {
    it('expect query rows with mapped values', async () => {
        const warehouse = new BigqueryWarehouseClient(credentials);

        (warehouse.client.createQueryJob as Mock) = vi.fn(
            () => createJobResponse,
        );

        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFieldsWithAwareTimestamp);
        expect(results.rows[0]).toEqual(expectedRow);
        expect(warehouse.client.createQueryJob as Mock).toHaveBeenCalledTimes(
            1,
        );
    });
    it('expect createQueryJob to set the time_zone connection property when a timezone is passed', async () => {
        const warehouse = new BigqueryWarehouseClient(credentials);

        (warehouse.client.createQueryJob as Mock) = vi.fn(
            () => createJobResponse,
        );

        await warehouse.runQuery('fake sql', undefined, 'Asia/Tokyo');

        expect(warehouse.client.createQueryJob as Mock).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionProperties: [
                    { key: 'time_zone', value: 'Asia/Tokyo' },
                ],
            }),
        );
    });
    it('expect createQueryJob to omit connection properties when no timezone is passed', async () => {
        const warehouse = new BigqueryWarehouseClient(credentials);

        (warehouse.client.createQueryJob as Mock) = vi.fn(
            () => createJobResponse,
        );

        await warehouse.runQuery('fake sql');

        expect(warehouse.client.createQueryJob as Mock).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionProperties: undefined,
            }),
        );
    });
    it('expect schema with bigquery types mapped to dimension types', async () => {
        const getTableMock = vi
            .fn()
            .mockImplementationOnce(() => getTableResponse);
        Dataset.prototype.table = getTableMock;
        const warehouse = new BigqueryWarehouseClient(credentials);
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchemaWithAwareTimestamp,
        );
        expect(getTableMock).toHaveBeenCalledTimes(1);
        expect(getTableResponse.getMetadata).toHaveBeenCalledTimes(1);
    });
});

describe('BigqueryWarehouseClient.getDatabases', () => {
    const createDataset = (datasetId: string) =>
        new Dataset(new BigQuery({ projectId: 'test-project' }), datasetId, {
            location: 'EU',
        });
    const createClient = (
        datasets: Dataset[],
        query: (sql: string) => Promise<QueryRowsResponse>,
    ) => ({
        getDatasets: vi
            .fn<() => Promise<DatasetsResponse>>()
            .mockResolvedValue([datasets]),
        query: vi.fn(query),
    });

    it('includes the stored size for each dataset', async () => {
        const datasets = [createDataset('small'), createDataset('large')];
        const queryMock = vi
            .fn<(sql: string) => Promise<QueryRowsResponse>>()
            .mockResolvedValueOnce([[{ sizeBytes: 100 }]])
            .mockResolvedValueOnce([[{ sizeBytes: 500 }]]);
        const client = createClient(datasets, queryMock);

        await expect(
            BigqueryWarehouseClient.getDatabases(
                'test-project',
                'refresh-token',
                client,
            ),
        ).resolves.toEqual([
            {
                projectId: 'test-project',
                datasetId: 'small',
                location: 'EU',
                sizeBytes: 100,
            },
            {
                projectId: 'test-project',
                datasetId: 'large',
                location: 'EU',
                sizeBytes: 500,
            },
        ]);
        expect(queryMock).toHaveBeenNthCalledWith(
            1,
            'SELECT SUM(size_bytes) AS sizeBytes FROM `test-project.small.__TABLES__`',
        );
    });

    it('returns null when an individual dataset size query fails', async () => {
        const datasets = [createDataset('unavailable'), createDataset('ok')];
        const queryMock = vi
            .fn<(sql: string) => Promise<QueryRowsResponse>>()
            .mockRejectedValueOnce(new Error('permission denied'))
            .mockResolvedValueOnce([[{ sizeBytes: 500 }]]);
        const client = createClient(datasets, queryMock);

        const result = await BigqueryWarehouseClient.getDatabases(
            'test-project',
            'refresh-token',
            client,
        );

        expect(
            result.map(({ datasetId, sizeBytes }) => ({
                datasetId,
                sizeBytes,
            })),
        ).toEqual([
            { datasetId: 'unavailable', sizeBytes: null },
            { datasetId: 'ok', sizeBytes: 500 },
        ]);
    });

    it('only queries sizes for the first 25 datasets', async () => {
        const datasets = Array.from({ length: 30 }, (_, index) =>
            createDataset(`dataset_${index}`),
        );
        const queryMock = vi
            .fn<(sql: string) => Promise<QueryRowsResponse>>()
            .mockResolvedValue([[{ sizeBytes: 100 }]]);
        const client = createClient(datasets, queryMock);

        const result = await BigqueryWarehouseClient.getDatabases(
            'test-project',
            'refresh-token',
            client,
        );

        expect(queryMock).toHaveBeenCalledTimes(25);
        expect(
            result.slice(0, 25).every(({ sizeBytes }) => sizeBytes === 100),
        ).toBe(true);
        expect(
            result.slice(25).every(({ sizeBytes }) => sizeBytes === null),
        ).toBe(true);
    });
});

describe('BigqueryWarehouseClient.getProjectRecommendation', () => {
    type RecommendationQuery = (options: {
        query: string;
        location: string;
    }) => Promise<QueryRowsResponse>;

    const createDataset = (
        projectId: string,
        datasetId: string,
        location: string,
    ) =>
        new Dataset(new BigQuery({ projectId }), datasetId, {
            location,
        });

    const createClient = (
        projectId: string,
        locations: string[],
        queryImplementation: RecommendationQuery,
    ) => {
        const datasets = locations.map((location, index) =>
            createDataset(projectId, `dataset_${index}`, location),
        );
        const getDatasets = vi.fn<() => Promise<DatasetsResponse>>();
        vi.mocked(getDatasets).mockResolvedValue([datasets]);
        const query = vi.fn<RecommendationQuery>();
        vi.mocked(query).mockImplementation(queryImplementation);
        return { getDatasets, query };
    };

    it('ranks projects by their largest dataset across distinct regions', async () => {
        const firstClient = createClient(
            'first-project',
            ['EU', 'US', 'EU'],
            async ({ location }) =>
                location === 'US'
                    ? [[{ table_schema: 'largest', total_bytes: 1200 }]]
                    : [[{ table_schema: 'smaller', total_bytes: 500 }]],
        );
        const secondClient = createClient(
            'second-project',
            ['EU'],
            async () => [
                [
                    { table_schema: 'small', total_bytes: 100 },
                    { table_schema: 'large', total_bytes: 900 },
                ],
            ],
        );
        const clients = new Map([
            ['first-project', firstClient],
            ['second-project', secondClient],
        ]);
        const clientFactory = vi.fn((projectId: string) => {
            const client = clients.get(projectId);
            if (!client) throw new Error('Unexpected project');
            return client;
        });
        const projects: BigqueryProject[] = [
            { projectId: 'first-project', friendlyName: null },
            { projectId: 'second-project', friendlyName: null },
        ];

        await expect(
            BigqueryWarehouseClient.getProjectRecommendation(
                projects,
                'refresh-token',
                clientFactory,
            ),
        ).resolves.toEqual({ projectId: 'first-project' });
        expect(vi.mocked(firstClient.getDatasets)).toHaveBeenCalledWith({
            autoPaginate: false,
            maxResults: 1000,
        });
        expect(vi.mocked(firstClient.query)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(firstClient.query)).toHaveBeenCalledWith({
            query: 'SELECT table_schema, SUM(total_logical_bytes) AS total_bytes FROM `first-project`.`region-us`.INFORMATION_SCHEMA.TABLE_STORAGE GROUP BY table_schema',
            location: 'US',
        });
    });

    it('skips a project when any of its region queries errors', async () => {
        const failingClient = createClient(
            'failing-project',
            ['EU', 'US'],
            async ({ location }) => {
                if (location === 'US') throw new Error('permission denied');
                return [[{ table_schema: 'largest', total_bytes: 5000 }]];
            },
        );
        const healthyClient = createClient(
            'healthy-project',
            ['EU'],
            async () => [[{ table_schema: 'available', total_bytes: 100 }]],
        );
        const clients = new Map([
            ['failing-project', failingClient],
            ['healthy-project', healthyClient],
        ]);
        const clientFactory = vi.fn((projectId: string) => {
            const client = clients.get(projectId);
            if (!client) throw new Error('Unexpected project');
            return client;
        });

        await expect(
            BigqueryWarehouseClient.getProjectRecommendation(
                [
                    { projectId: 'failing-project', friendlyName: null },
                    { projectId: 'healthy-project', friendlyName: null },
                ],
                'refresh-token',
                clientFactory,
            ),
        ).resolves.toEqual({ projectId: 'healthy-project' });
    });

    it('returns no recommendation when every project score is unavailable', async () => {
        const client = createClient('unavailable-project', ['EU'], async () => {
            throw new Error('permission denied');
        });
        const clientFactory = vi.fn<(projectId: string) => typeof client>();
        vi.mocked(clientFactory).mockReturnValue(client);

        await expect(
            BigqueryWarehouseClient.getProjectRecommendation(
                [{ projectId: 'unavailable-project', friendlyName: null }],
                'refresh-token',
                clientFactory,
            ),
        ).resolves.toEqual({ projectId: null });
    });

    it('caps ranking at eight projects and three regions per project', async () => {
        const projects: BigqueryProject[] = Array.from(
            { length: 10 },
            (_, index) => ({
                projectId: `project-${index}`,
                friendlyName: null,
            }),
        );
        const clients = new Map(
            projects.map(({ projectId }, index) => [
                projectId,
                createClient(
                    projectId,
                    ['EU', 'US', 'asia-east1', 'us-west1'],
                    async () => [
                        [{ table_schema: 'dataset', total_bytes: index }],
                    ],
                ),
            ]),
        );
        const clientFactory = vi.fn((projectId: string) => {
            const client = clients.get(projectId);
            if (!client) throw new Error('Unexpected project');
            return client;
        });

        await expect(
            BigqueryWarehouseClient.getProjectRecommendation(
                projects,
                'refresh-token',
                clientFactory,
            ),
        ).resolves.toEqual({ projectId: 'project-7' });
        expect(vi.mocked(clientFactory)).toHaveBeenCalledTimes(8);
        projects.forEach(({ projectId }, index) => {
            const client = clients.get(projectId);
            if (!client) throw new Error('Unexpected project');
            expect(vi.mocked(client.getDatasets)).toHaveBeenCalledTimes(
                index < 8 ? 1 : 0,
            );
            expect(vi.mocked(client.query)).toHaveBeenCalledTimes(
                index < 8 ? 3 : 0,
            );
        });
    });
});

describe('BigqueryWarehouseClient.sanitizeLabelsWithValues', () => {
    let warnSpy: MockInstance;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('returns undefined when given no labels', () => {
        expect(
            BigqueryWarehouseClient.sanitizeLabelsWithValues(undefined),
        ).toBeUndefined();
    });

    it('lowercases and normalises string values', () => {
        expect(
            BigqueryWarehouseClient.sanitizeLabelsWithValues({
                Scheduler_Uuid: 'ABC-123',
            }),
        ).toEqual({ scheduler_uuid: 'abc-123' });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('coerces numeric values without crashing and logs a warning', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            job_id: 224187 as unknown as string,
        });
        expect(result).toEqual({ job_id: '224187' });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('coerced non-string label value'),
            { key: 'job_id', valueType: 'number' },
        );
    });

    it('replaces null/undefined with empty_value silently', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            scheduler_name: null as unknown as string,
            saved_sql_uuid: undefined as unknown as string,
        });
        expect(result).toEqual({
            scheduler_name: 'empty_value',
            saved_sql_uuid: 'empty_value',
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('coerces boolean values', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            embed: true as unknown as string,
        });
        expect(result).toEqual({ embed: 'true' });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ valueType: 'boolean' }),
        );
    });

    it('sanitizes user attribute query tags for BigQuery labels', () => {
        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues({
            'user_attribute_User Tier': 'Enterprise Customer/EMEA',
            user_attribute_company: "O'Reilly Media",
        });
        expect(result).toEqual({
            user_attribute_user_tier: 'enterprise_customer_emea',
            user_attribute_company: 'o_reilly_media',
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('limits labels to the BigQuery maximum', () => {
        const labels = Object.fromEntries(
            Array.from({ length: 70 }, (_, index) => [
                `user_attribute_${index}`,
                `value_${index}`,
            ]),
        );

        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues(labels);

        expect(Object.keys(result ?? {})).toHaveLength(64);
    });

    it('keeps non-user-attribute labels when user attributes exceed the BigQuery maximum', () => {
        const labels = {
            ...Object.fromEntries(
                Array.from({ length: 70 }, (_, index) => [
                    `user_attribute_${index}`,
                    `value_${index}`,
                ]),
            ),
            query_uuid: 'query-uuid',
        };

        const result = BigqueryWarehouseClient.sanitizeLabelsWithValues(labels);

        expect(result).toEqual(
            expect.objectContaining({ query_uuid: 'query-uuid' }),
        );
        expect(Object.keys(result ?? {})).toHaveLength(64);
    });
});

describe('BigquerySqlBuilder escaping', () => {
    const bigquerySqlBuilder = new BigquerySqlBuilder();

    test('Should escape backslashes and quotes in bigquery', () => {
        expect(bigquerySqlBuilder.escapeString("\\') OR (1=1) --")).toBe(
            "\\\\\\') OR (1=1) ",
        );
    });

    test('Should handle SQL injection attempts', () => {
        // Test with a typical SQL injection pattern
        const maliciousInput = "'; DROP TABLE users; --";
        const escaped = bigquerySqlBuilder.escapeString(maliciousInput);
        expect(escaped).toBe("\\'; DROP TABLE users; ");

        // Test with another common SQL injection pattern
        const anotherMaliciousInput = "' OR '1'='1";
        const anotherEscaped = bigquerySqlBuilder.escapeString(
            anotherMaliciousInput,
        );
        expect(anotherEscaped).toBe("\\' OR \\'1\\'=\\'1");
    });

    test('Should NOT remove # comments from strings', () => {
        // Test that # symbols are preserved in strings (not treated as comments)
        const stringWithHash = 'Column name with # symbol';
        const escaped = bigquerySqlBuilder.escapeString(stringWithHash);
        expect(escaped).toBe('Column name with # symbol');

        // Test that # at start of line is preserved
        const hashAtStart = '#important-tag';
        const escapedHashStart = bigquerySqlBuilder.escapeString(hashAtStart);
        expect(escapedHashStart).toBe('#important-tag');

        // Test multiple # symbols are preserved
        const multipleHashes = 'value1#value2#value3';
        const escapedMultiple = bigquerySqlBuilder.escapeString(multipleHashes);
        expect(escapedMultiple).toBe('value1#value2#value3');
    });

    test('Should still remove -- and /* */ comments', () => {
        // Test that -- comments are still removed
        const stringWithDashComment = 'test value -- this is a comment';
        const escapedDash = bigquerySqlBuilder.escapeString(
            stringWithDashComment,
        );
        expect(escapedDash).toBe('test value ');

        // Test that /* */ comments are still removed
        const stringWithBlockComment = 'test /* block comment */ value';
        const escapedBlock = bigquerySqlBuilder.escapeString(
            stringWithBlockComment,
        );
        expect(escapedBlock).toBe('test  value');
    });
});

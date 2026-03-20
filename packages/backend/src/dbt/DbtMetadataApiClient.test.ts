import { DbtModelNode } from '@lightdash/common';
import { GraphQLClient } from 'graphql-request';
import { DbtMetadataApiClient } from './DbtMetadataApiClient';

jest.mock('graphql-request');

const makeNode = (overrides: Record<string, unknown> = {}) => ({
    resourceType: 'model',
    accountId: '1',
    projectId: '1',
    environmentId: '1',
    uniqueId: 'model.project.pull_requests',
    name: 'pull_requests',
    description: '',
    meta: {},
    tags: [],
    filePath: 'models/pull_requests.sql',
    database: 'dbt_semantic_layer',
    schema: 'prod',
    alias: 'pull_requests',
    packageName: 'project',
    rawCode: 'SELECT 1',
    compiledCode: 'SELECT 1',
    materializedType: 'table',
    language: 'sql',
    packages: [],
    dbtVersion: '1.8.0',
    group: '',
    access: 'public',
    deprecationDate: '',
    version: '',
    latestVersion: '',
    releaseVersion: '',
    contractEnforced: false,
    patchPath: '',
    config: {},
    catalog: { columns: [] },
    ...overrides,
});

const makeApiResponse = (adapterType: string, nodes: unknown[]) => ({
    environment: {
        adapterType,
        applied: {
            lastUpdatedAt: '2026-01-01T00:00:00Z',
            models: {
                totalCount: nodes.length,
                pageInfo: {
                    startCursor: '0',
                    hasNextPage: false,
                    endCursor: '0',
                },
                edges: nodes.map((node) => ({ node })),
            },
        },
    },
});

const createClient = () =>
    new DbtMetadataApiClient({
        environmentId: '123',
        bearerToken: 'test-token',
        discoveryApiEndpoint: undefined,
        tags: undefined,
    });

describe('DbtMetadataApiClient', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('Snowflake identifier casing', () => {
        it('should uppercase database, schema, alias, and relation_name for Snowflake', async () => {
            const mockRequest = jest
                .fn()
                .mockResolvedValue(makeApiResponse('snowflake', [makeNode()]));
            (GraphQLClient as jest.Mock).mockImplementation(() => ({
                request: mockRequest,
            }));

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.database).toBe('DBT_SEMANTIC_LAYER');
            expect(model.schema).toBe('PROD');
            expect(model.alias).toBe('PULL_REQUESTS');
            expect(model.relation_name).toBe(
                '"DBT_SEMANTIC_LAYER"."PROD"."PULL_REQUESTS"',
            );
        });

        it('should use model name when alias is empty for Snowflake', async () => {
            const mockRequest = jest
                .fn()
                .mockResolvedValue(
                    makeApiResponse('snowflake', [
                        makeNode({ alias: '', name: 'my_model' }),
                    ]),
                );
            (GraphQLClient as jest.Mock).mockImplementation(() => ({
                request: mockRequest,
            }));

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.alias).toBe('MY_MODEL');
            expect(model.relation_name).toBe(
                '"DBT_SEMANTIC_LAYER"."PROD"."MY_MODEL"',
            );
        });
    });

    describe('non-Snowflake identifier casing', () => {
        it('should preserve original casing for Postgres', async () => {
            const mockRequest = jest
                .fn()
                .mockResolvedValue(makeApiResponse('postgres', [makeNode()]));
            (GraphQLClient as jest.Mock).mockImplementation(() => ({
                request: mockRequest,
            }));

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.database).toBe('dbt_semantic_layer');
            expect(model.schema).toBe('prod');
            expect(model.alias).toBe('pull_requests');
            expect(model.relation_name).toBe(
                '"dbt_semantic_layer"."prod"."pull_requests"',
            );
        });

        it('should preserve original casing for BigQuery', async () => {
            const mockRequest = jest
                .fn()
                .mockResolvedValue(makeApiResponse('bigquery', [makeNode()]));
            (GraphQLClient as jest.Mock).mockImplementation(() => ({
                request: mockRequest,
            }));

            const client = createClient();
            const result = await client.getDbtManifest();
            const model = result.manifest.nodes[
                'model.project.pull_requests'
            ] as DbtModelNode;

            expect(model.relation_name).toBe(
                '`dbt_semantic_layer`.`prod`.`pull_requests`',
            );
        });
    });
});

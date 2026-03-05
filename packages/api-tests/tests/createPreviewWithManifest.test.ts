import { SEED_PROJECT, type SummaryExplore } from '@lightdash/common';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

const apiUrl = '/api/v1';
const projectUuid = SEED_PROJECT.project_uuid;

// Minimal dbt manifest for testing
const minimalManifest = {
    metadata: {
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v12.json',
        dbt_version: '1.0.0',
        generated_at: '2024-01-01T00:00:00Z',
        invocation_id: 'test-invocation',
        env: {},
        project_id: 'test-project',
        user_id: 'test-user',
        adapter_type: 'postgres',
    },
    nodes: {
        'model.test_project.test_model': {
            unique_id: 'model.test_project.test_model',
            package_name: 'test_project',
            path: 'test_model.sql',
            original_file_path: 'models/test_model.sql',
            name: 'test_model',
            resource_type: 'model',
            alias: 'test_model',
            checksum: { name: 'sha256', checksum: 'abc123' },
            config: {},
            tags: [],
            refs: [],
            sources: [],
            depends_on: { macros: [], nodes: [] },
            database: 'test_db',
            schema: 'test_schema',
            fqn: ['test_project', 'test_model'],
            compiled_path: 'target/compiled/test_project/models/test_model.sql',
            raw_code: "SELECT 1 as id, 'test' as name",
            compiled_code: "SELECT 1 as id, 'test' as name",
            columns: {
                id: {
                    name: 'id',
                    description: 'Unique identifier for each record',
                    meta: {
                        dimension: {
                            type: 'number',
                        },
                        metrics: {
                            total_records: {
                                type: 'count',
                                description: 'Total number of records',
                                label: 'Total Records',
                            },
                            unique_ids: {
                                type: 'count_distinct',
                                description: 'Count of unique IDs',
                                label: 'Unique IDs',
                            },
                        },
                    },
                    data_type: 'integer',
                    constraints: [],
                    quote: null,
                },
                name: {
                    name: 'name',
                    description: 'Name of the record',
                    meta: {
                        metrics: {
                            unique_names: {
                                type: 'count_distinct',
                                description: 'Count of unique names',
                                label: 'Unique Names',
                            },
                        },
                    },
                    data_type: 'varchar',
                    constraints: [],
                    quote: null,
                },
            },
            meta: {
                lightdash: {
                    enabled: true,
                },
            },
            description: 'A test model',
            created_at: 1640995200.0,
            relation_name: '"test_db"."test_schema"."test_model"',
            language: 'sql',
        },
    },
    sources: {},
    macros: {},
    docs: {},
    exposures: {},
    metrics: {},
    groups: {},
    selectors: {},
    disabled: {},
    parent_map: {},
    child_map: {},
};

describe('Create Preview with Manifest API', () => {
    let admin: ApiClient;
    let previewProjectUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();
    });

    afterEach(async () => {
        // Clean up preview project if it was created
        if (previewProjectUuid) {
            await admin.delete(`${apiUrl}/org/projects/${previewProjectUuid}`, {
                failOnStatusCode: false,
            });
            previewProjectUuid = null;
        }
    });

    it('Should handle empty manifest gracefully', async () => {
        const createPreviewBody = {
            name: 'E2E Test Preview Empty Manifest',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: '', // Empty manifest
            },
        };

        const response = await admin.post<any>(
            `${apiUrl}/projects/${projectUuid}/createPreview`,
            createPreviewBody,
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');

        previewProjectUuid = response.body.results.projectUuid;
    });

    it('Should accept manifest parameter in createPreview API', async () => {
        const createPreviewBody = {
            name: 'E2E Test Preview with Manifest',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: JSON.stringify(minimalManifest),
            },
        };

        const response = await admin.post<any>(
            `${apiUrl}/projects/${projectUuid}/createPreview`,
            createPreviewBody,
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body.results).toHaveProperty('projectUuid');
        expect(response.body.results).toHaveProperty('compileJobUuid');

        previewProjectUuid = response.body.results.projectUuid;
    });

    it('Should confirm explores match manifest', async () => {
        const createPreviewBody = {
            name: 'E2E Test Preview with Manifest',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: JSON.stringify(minimalManifest),
            },
        };

        const response = await admin.post<any>(
            `${apiUrl}/projects/${projectUuid}/createPreview`,
            createPreviewBody,
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body.results).toHaveProperty('projectUuid');
        expect(response.body.results).toHaveProperty('compileJobUuid');

        previewProjectUuid = response.body.results.projectUuid;

        // TODO: Confirm explores match manifest
    });

    it('Should verify explores API returns models and metrics from custom manifest', async () => {
        const createPreviewBody = {
            name: 'E2E Test Preview with Manifest for Explores',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: JSON.stringify(minimalManifest),
            },
        };

        // Create preview project with custom manifest
        const response = await admin.post<any>(
            `${apiUrl}/projects/${projectUuid}/createPreview`,
            createPreviewBody,
        );
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body.results).toHaveProperty('projectUuid');
        expect(response.body.results).toHaveProperty('compileJobUuid');

        previewProjectUuid = response.body.results.projectUuid;

        // Poll the explores API until explores are available
        const exploresBody = await pollUntil<any>(
            admin,
            `${apiUrl}/projects/${previewProjectUuid}/explores`,
            {
                timeout: 30_000,
                interval: 1_000,
                condition: (body: any) =>
                    body.results && body.results.length > 0,
            },
        );

        expect(exploresBody.results).toBeInstanceOf(Array);

        const explores = exploresBody.results;

        // Verify that the test_model from our manifest is present
        const testModelExplore = explores.find(
            (explore: SummaryExplore) => explore.name === 'test_model',
        );
        expect(testModelExplore).toBeDefined();
        expect(testModelExplore).toHaveProperty('name', 'test_model');
        expect(testModelExplore).toHaveProperty('label', 'Test model');
        expect(testModelExplore).toHaveProperty('schemaName', 'test_schema');
        expect(testModelExplore).toHaveProperty('databaseName', 'test_db');

        // Get the full explore details for test_model
        const exploreDetailResp = await admin.get<any>(
            `${apiUrl}/projects/${previewProjectUuid}/explores/test_model`,
        );
        expect(exploreDetailResp.status).toBe(200);
        expect(exploreDetailResp.body).toHaveProperty('status', 'ok');

        const exploreDetail = exploreDetailResp.body.results;

        // Verify the explore has the expected structure
        expect(exploreDetail).toHaveProperty('name', 'test_model');
        expect(exploreDetail).toHaveProperty('baseTable', 'test_model');
        expect(exploreDetail).toHaveProperty('tables');

        // Verify the table exists in the explore
        expect(exploreDetail.tables).toHaveProperty('test_model');
        const table = exploreDetail.tables.test_model;

        // Verify dimensions from our manifest
        expect(table).toHaveProperty('dimensions');
        expect(table.dimensions).toHaveProperty('id');
        expect(table.dimensions).toHaveProperty('name');

        // Verify the id dimension properties
        expect(table.dimensions.id).toHaveProperty('name', 'id');
        expect(table.dimensions.id).toHaveProperty('type', 'number');

        // Verify the name dimension properties
        expect(table.dimensions.name).toHaveProperty('name', 'name');
        expect(table.dimensions.name).toHaveProperty('type', 'string');

        // Verify metrics (should include custom metrics from manifest)
        expect(table).toHaveProperty('metrics');

        // Check for common auto-generated metrics
        const metricNames = Object.keys(table.metrics);
        expect(metricNames.length).toBeGreaterThan(0);

        const hasCustomMetric = metricNames.some(
            (name: string) => name === 'total_records',
        );
        expect(hasCustomMetric).toBe(true);
    }, 60_000);
});

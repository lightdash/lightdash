import { SEED_PROJECT, type SummaryExplore } from '@lightdash/common';

const apiUrl = '/api/v1';

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
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeEach(() => {
        cy.login();
        cy.wrap(null).as('previewProjectUuid'); // placeholder for previewProjectUuid alias
    });

    afterEach(() => {
        // Clean up test role if it exists
        cy.get('@previewProjectUuid').then((previewProjectUuid) => {
            if (previewProjectUuid) {
                cy.request({
                    method: 'DELETE',
                    url: `${apiUrl}/org/projects/${previewProjectUuid}`,
                    failOnStatusCode: false,
                }).then((response) => {
                    cy.log(
                        `Cleaned up project ${previewProjectUuid}: ${response.status}`,
                    );
                });
            }
        });
    });

    it('Should handle empty manifest gracefully', () => {
        const createPreviewBody = {
            name: 'E2E Test Preview Empty Manifest',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: '', // Empty manifest
            },
        };

        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/createPreview`,
            body: createPreviewBody,
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('status', 'ok');

            cy.wrap(response.body.results.projectUuid).as('previewProjectUuid');
        });
    });

    it('Should accept manifest parameter in createPreview API', () => {
        const createPreviewBody = {
            name: 'E2E Test Preview with Manifest',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: JSON.stringify(minimalManifest),
            },
        };

        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/createPreview`,
            body: createPreviewBody,
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('status', 'ok');
            expect(response.body.results).to.have.property('projectUuid');
            expect(response.body.results).to.have.property('compileJobUuid');

            cy.wrap(response.body.results.projectUuid).as('previewProjectUuid');
        });
    });

    it('Should confirm explores match manifest', () => {
        const createPreviewBody = {
            name: 'E2E Test Preview with Manifest',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: JSON.stringify(minimalManifest),
            },
        };

        // Test that API accepts manifest parameter (basic integration test)
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/createPreview`,
            body: createPreviewBody,
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('status', 'ok');
            expect(response.body.results).to.have.property('projectUuid');
            expect(response.body.results).to.have.property('compileJobUuid');

            cy.wrap(response.body.results.projectUuid).as('previewProjectUuid');

            // TODO: Confirm explores match manifest
        });
    });

    it('Should verify explores API returns models and metrics from custom manifest', () => {
        const createPreviewBody = {
            name: 'E2E Test Preview with Manifest for Explores',
            copyContent: false,
            dbtConnectionOverrides: {
                manifest: JSON.stringify(minimalManifest),
            },
        };

        // Create preview project with custom manifest
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/createPreview`,
            body: createPreviewBody,
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('status', 'ok');
            expect(response.body.results).to.have.property('projectUuid');
            expect(response.body.results).to.have.property('compileJobUuid');

            const previewProjectUuid = response.body.results.projectUuid;
            cy.wrap(previewProjectUuid).as('previewProjectUuid');

            // Poll the explores API until explores are available
            const pollExplores = () => {
                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/projects/${previewProjectUuid}/explores`,
                }).then((exploresResponse) => {
                    if (
                        exploresResponse.body.results &&
                        exploresResponse.body.results.length > 0
                    ) {
                        // Explores are available, proceed with the test
                        expect(exploresResponse.status).to.eq(200);
                        expect(exploresResponse.body).to.have.property(
                            'status',
                            'ok',
                        );
                        expect(exploresResponse.body.results).to.be.an('array');

                        const explores = exploresResponse.body.results;

                        // Verify that the test_model from our manifest is present
                        const testModelExplore = explores.find(
                            (explore: SummaryExplore) =>
                                explore.name === 'test_model',
                        );
                        cy.wrap(testModelExplore).should(
                            'have.property',
                            'name',
                            'test_model',
                        );
                        cy.wrap(testModelExplore).should(
                            'have.property',
                            'label',
                            'Test model',
                        );
                        cy.wrap(testModelExplore).should(
                            'have.property',
                            'schemaName',
                            'test_schema',
                        );
                        cy.wrap(testModelExplore).should(
                            'have.property',
                            'databaseName',
                            'test_db',
                        );

                        // Get the full explore details for test_model
                        cy.request({
                            method: 'GET',
                            url: `${apiUrl}/projects/${previewProjectUuid}/explores/test_model`,
                        }).then((exploreDetailResponse) => {
                            expect(exploreDetailResponse.status).to.eq(200);
                            expect(exploreDetailResponse.body).to.have.property(
                                'status',
                                'ok',
                            );

                            const exploreDetail =
                                exploreDetailResponse.body.results;

                            // Verify the explore has the expected structure
                            expect(exploreDetail).to.have.property(
                                'name',
                                'test_model',
                            );
                            expect(exploreDetail).to.have.property(
                                'baseTable',
                                'test_model',
                            );
                            expect(exploreDetail).to.have.property('tables');

                            // Verify the table exists in the explore
                            expect(exploreDetail.tables).to.have.property(
                                'test_model',
                            );
                            const table = exploreDetail.tables.test_model;

                            // Verify dimensions from our manifest
                            expect(table).to.have.property('dimensions');
                            expect(table.dimensions).to.have.property('id');
                            expect(table.dimensions).to.have.property('name');

                            // Verify the id dimension properties
                            expect(table.dimensions.id).to.have.property(
                                'name',
                                'id',
                            );
                            expect(table.dimensions.id).to.have.property(
                                'type',
                                'number',
                            );

                            // Verify the name dimension properties
                            expect(table.dimensions.name).to.have.property(
                                'name',
                                'name',
                            );
                            expect(table.dimensions.name).to.have.property(
                                'type',
                                'string',
                            );

                            // Verify metrics (should include custom metrics from manifest)
                            expect(table).to.have.property('metrics');

                            // Check for common auto-generated metrics
                            const metricNames = Object.keys(table.metrics);
                            expect(metricNames.length).to.be.greaterThan(0);

                            cy.log(metricNames.join(', '));

                            const hasCustomMetric = metricNames.some(
                                (name: string) => name === 'total_records',
                            );
                            cy.wrap(hasCustomMetric).should('be.true');
                        });
                    } else {
                        // Explores are not ready yet, wait 1 second and try again
                        cy.wait(1000);
                        pollExplores();
                    }
                });
            };

            // Start polling for explores
            pollExplores();
        });
    });
});

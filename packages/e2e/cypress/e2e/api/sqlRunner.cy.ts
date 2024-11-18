import {
    ApiWarehouseTableFields,
    ChartKind,
    CreateSqlChart,
    SEED_PROJECT,
    UpdateSqlChart,
    WarehouseTypes,
} from '@lightdash/common';
import warehouseConnections from '../../support/warehouses';

const apiUrl = '/api/v1';

// Object.entries({ postgres: warehouseConnections.postgresSQL }).forEach(  // For testing
Object.entries(warehouseConnections).forEach(
    // Object.entries({ databricks: warehouseConnections.databricks }).forEach(

    // Object.entries({ snowflake: warehouseConnections.snowflake }).forEach(
    // For testing
    ([warehouseName, warehouseConfig]) => {
        const getDatabaseDetails = () => {
            switch (warehouseConfig.type) {
                case WarehouseTypes.DATABRICKS:
                    return [
                        warehouseConfig.catalog || '',
                        warehouseConfig.database,
                    ];
                case WarehouseTypes.SNOWFLAKE:
                    return [warehouseConfig.database, warehouseConfig.schema];
                case WarehouseTypes.BIGQUERY:
                    return [warehouseConfig.project, warehouseConfig.dataset];
                case WarehouseTypes.REDSHIFT:
                case WarehouseTypes.POSTGRES:
                    return [warehouseConfig.dbname, warehouseConfig.schema];
                default:
                    return ['unknown', 'unknown'];
            }
        };
        describe(`Get tables and fields for SQL runner on ${warehouseName} `, () => {
            const projectName = `SqlRunner ${warehouseName} ${Date.now()}`;
            let projectUuid: string;
            beforeEach(() => {
                cy.login();
            });
            before('create upstream project', () => {
                cy.login();
                cy.createProject(projectName, warehouseConfig).then((puuid) => {
                    projectUuid = puuid;
                });
            });

            after('delete upstream project', () => {
                cy.log(`Deleting project by name ${projectName}`);
                cy.deleteProjectsByName([projectName]);
            });

            // test for invalid sql
            // note each db type may have different error messages
            it.skip(`Get error on invalid SQL for ${warehouseName}`, () => {
                const sql = `SELECT * FROM ${getDatabaseDetails()[0]}.${
                    getDatabaseDetails()[1]
                }.raw_customers`;
                cy.log(`sql ${sql}`);
                cy.request({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/run`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: JSON.stringify({
                        sql,
                    }),
                }).then((runResp) => {
                    expect(runResp.status).to.eq(200);
                    const { jobId } = runResp.body.results;

                    const maxRetries = 20; // Snowflake is a bit slow compared to the others (normally takes ~3 seconds)

                    // Poll request until job is `completed`
                    const poll = (retries = 0) => {
                        cy.wait(500);
                        cy.request({
                            url: `${apiUrl}/schedulers/job/${jobId}/status`,
                            method: 'GET',
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);
                            cy.log(
                                `Job status (${retries}): ${resp.body.results.status}`,
                            );
                            cy.log(JSON.stringify(resp));
                            if (
                                resp.body.results.status === 'completed' ||
                                resp.body.results.status === 'error'
                            ) {
                                switch (warehouseConfig.type) {
                                    case WarehouseTypes.SNOWFLAKE:
                                        expect(resp.body.results.status).to.eq(
                                            'error',
                                        );
                                        expect(
                                            resp.body.results.details.error,
                                        ).to.include('SQL compilation error:');
                                        expect(
                                            resp.body.results.details
                                                .lineNumber,
                                        ).to.eq(1);
                                        expect(
                                            resp.body.results.details
                                                .charNumber,
                                        ).to.eq(48);
                                        break;
                                    case WarehouseTypes.BIGQUERY:
                                        expect(resp.body.results.status).to.eq(
                                            'error',
                                        );
                                        expect(
                                            resp.body.results.details.error,
                                        ).to.include('Syntax error:');
                                        expect(
                                            resp.body.results.details
                                                .lineNumber,
                                        ).to.eq(1);
                                        expect(
                                            resp.body.results.details
                                                .charNumber,
                                        ).to.eq(48);
                                        break;
                                    case WarehouseTypes.POSTGRES:
                                        expect(
                                            resp.body.results.details.error,
                                        ).to.include('syntax error');
                                        expect(
                                            resp.body.results.details
                                                .lineNumber,
                                        ).to.eq(1);
                                        expect(
                                            resp.body.results.details
                                                .charNumber,
                                        ).to.eq(15);
                                        break;
                                    default:
                                        expect(resp.body.results.status).to.eq(
                                            'error',
                                        );
                                        expect(
                                            resp.body.results.details.error,
                                        ).to.include('syntax error');
                                        break;
                                }
                            } // Else keep polling
                            else if (retries < maxRetries) {
                                poll(retries + 1);
                            } else {
                                expect(
                                    resp.body.results.status,
                                    'Reached max number of retries without getting completed job',
                                ).to.eq('completed');
                            }
                        });
                    };
                    poll();
                });
            });

            it(`Get tables for SQL runner ${warehouseName}`, () => {
                cy.request({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/tables`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);

                    const [database, schema] = getDatabaseDetails();

                    expect(Object.keys(resp.body.results)).to.include(database);
                    expect(Object.keys(resp.body.results[database])).to.include(
                        schema,
                    );
                    if (warehouseConfig.type === WarehouseTypes.SNOWFLAKE) {
                        ['CUSTOMERS', 'ORDERS', 'PAYMENTS'].forEach((table) => {
                            expect(
                                Object.keys(
                                    resp.body.results[database][schema],
                                ),
                            ).to.include(table);
                        });
                        expect(
                            Object.keys(
                                resp.body.results[database][schema].ORDERS,
                            ),
                        ).to.be.deep.eq([]);
                    } else {
                        ['customers', 'orders', 'payments'].forEach((table) => {
                            expect(
                                Object.keys(
                                    resp.body.results[database][schema],
                                ),
                            ).to.include(table);
                        });
                        expect(
                            Object.keys(
                                resp.body.results[database][schema].orders,
                            ),
                        ).to.be.deep.eq([]);
                    }
                });
            });
            it(`Get fields for SQL runner ${warehouseName}`, () => {
                const tableName =
                    warehouseConfig.type === WarehouseTypes.SNOWFLAKE
                        ? 'ORDERS'
                        : 'orders';
                cy.request<ApiWarehouseTableFields>({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/fields?tableName=${tableName}&schemaName=${
                        getDatabaseDetails()[1]
                    }`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);

                    const { results } = resp.body;

                    expect(Object.keys(results)).to.have.length.gt(5);

                    if (warehouseConfig.type === WarehouseTypes.SNOWFLAKE) {
                        ['ORDER_ID', 'STATUS', 'AMOUNT'].forEach((table) => {
                            expect(Object.keys(results)).to.include(table);
                        });
                        expect(results.AMOUNT).to.be.eq('number');
                        expect(results.STATUS).to.be.eq('string');
                        expect(results.IS_COMPLETED).to.be.eq('boolean');
                        expect(results.ORDER_DATE).to.be.eq('date');
                    } else {
                        ['order_id', 'status', 'amount'].forEach((table) => {
                            expect(Object.keys(results)).to.include(table);
                        });
                        expect(results.amount).to.be.eq('number');
                        expect(results.status).to.be.eq('string');
                        expect(results.is_completed).to.be.eq('boolean');
                        expect(results.order_date).to.be.eq('date');
                    }
                });
            });

            it(`Get streaming results from ${warehouseName}`, () => {
                const [database, schema] = getDatabaseDetails();
                const selectFields =
                    warehouseConfig.type !== WarehouseTypes.SNOWFLAKE
                        ? `*`
                        : `payment_id as "payment_id",
                amount as "amount",
                payment_method as "payment_method"`; // Need to lowercase column ids in snowflake
                const sql = `SELECT ${selectFields}
                             FROM ${database}.${schema}.payments
                             ORDER BY payment_id asc LIMIT 2`;

                cy.request({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/run`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: JSON.stringify({
                        sql,
                    }),
                }).then((runResp) => {
                    expect(runResp.status).to.eq(200);
                    const { jobId } = runResp.body.results;

                    const maxRetries = 20; // Snowflake is a bit slow compared to the others (normally takes ~3 seconds)

                    // Poll request until job is `completed`
                    const poll = (retries = 0) => {
                        cy.wait(500);
                        cy.request({
                            url: `${apiUrl}/schedulers/job/${jobId}/status`,
                            method: 'GET',
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);
                            cy.log(
                                `Job status (${retries}): ${resp.body.results.status}`,
                            );
                            if (
                                resp.body.results.status === 'completed' ||
                                resp.body.results.status === 'error'
                            ) {
                                expect(resp.body.results.status).to.eq(
                                    'completed',
                                );
                                const { fileUrl } = resp.body.results.details;
                                cy.request({
                                    url: fileUrl,
                                    method: 'GET',
                                }).then((fileResp) => {
                                    expect(fileResp.status).to.eq(200);
                                    const lines = fileResp.body
                                        .trim()
                                        .split('\n');
                                    const results = lines.map((line) =>
                                        JSON.parse(line),
                                    );

                                    expect(results).to.have.length(2);

                                    expect(results[0].payment_id).to.be.eq(1);

                                    expect(results[0].payment_method).to.be.eq(
                                        'credit_card',
                                    );

                                    expect(results[1].payment_id).to.be.eq(2);
                                    expect(results[1].payment_method).to.be.eq(
                                        'credit_card',
                                    );
                                });
                            } // Else keep polling
                            else if (retries < maxRetries) {
                                poll(retries + 1);
                            } else {
                                expect(
                                    resp.body.results.status,
                                    'Reached max number of retries without getting completed job',
                                ).to.eq('completed');
                            }
                        });
                    };
                    poll();
                });
            });
            it(`Run pivot query for ${warehouseName}`, () => {
                const [database, schema] = getDatabaseDetails();
                const sql =
                    warehouseConfig.type === WarehouseTypes.SNOWFLAKE
                        ? `SELECT "orders".order_id AS "order_id", 
                    "orders".status AS "status"
                     FROM ${database}.${schema}.orders AS "orders"`
                        : `SELECT * FROM ${database}.${schema}.orders`;
                const pivotQueryPayload = {
                    sql,
                    indexColumn: { reference: 'status', type: 'category' },
                    valuesColumns: [
                        { reference: 'order_id', aggregation: 'sum' },
                    ],
                    limit: 500,
                };

                cy.request({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/runPivotQuery`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'POST',
                    body: JSON.stringify(pivotQueryPayload),
                }).then((runResp) => {
                    expect(runResp.status).to.eq(200);
                    const { jobId } = runResp.body.results;

                    const maxRetries = 50;

                    // Poll request until job is `completed`
                    const poll = (retries = 0) => {
                        cy.wait(1000);
                        cy.request({
                            url: `${apiUrl}/schedulers/job/${jobId}/status`,
                            method: 'GET',
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);
                            cy.log(
                                `Job status (${retries}): ${resp.body.results.status}`,
                            );
                            if (
                                resp.body.results.status === 'completed' ||
                                resp.body.results.status === 'error'
                            ) {
                                expect(resp.body.results.status).to.eq(
                                    'completed',
                                );
                                const { fileUrl } = resp.body.results.details;
                                cy.request({
                                    url: fileUrl,
                                    method: 'GET',
                                }).then((fileResp) => {
                                    expect(fileResp.status).to.eq(200);
                                    const lines = fileResp.body
                                        .trim()
                                        .split('\n');
                                    const results = lines.map((line) =>
                                        JSON.parse(line),
                                    );

                                    expect(results).to.have.length.greaterThan(
                                        0,
                                    );
                                    expect(results[0]).to.have.property(
                                        'status',
                                    );
                                    expect(results[0]).to.have.property(
                                        'order_id_sum',
                                    );
                                });
                            } else if (retries < maxRetries) {
                                poll(retries + 1);
                            } else {
                                expect(
                                    resp.body.results.status,
                                    'Reached max number of retries without getting completed job',
                                ).to.eq('completed');
                            }
                        });
                    };
                    poll();
                });
            });
        });
    },
);

// Load testing
describe.skip(`Load testing`, () => {
    beforeEach(() => {
        cy.login();
    });

    it(`Load testing streaming 1M results `, () => {
        // This SQL generates 50k random results on Postgres
        const sql = `
            SELECT gs.id AS payment_id,
                   (1000 + random() * 10000)::int AS amount,  -- Random amount between 1000 and 11000 (current_date - (random() * 365)::int)::date AS payment_date,  -- Random date within the last year md5(random()::text) AS payment_method, -- Random payment reference
                   (random() * 100000)::int AS customer_id  -- Random customer_id between 0 and 100000
            FROM generate_series(1, 50000) AS gs(id) -- Generate 50k rows
        `;

        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/run`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: JSON.stringify({
                sql,
            }),
        }).then((runResp) => {
            expect(runResp.status).to.eq(200);
            const { jobId } = runResp.body.results;

            const maxRetries = 50;

            // Poll request until job is `completed`
            const poll = (retries = 0) => {
                cy.wait(1000);
                cy.request({
                    url: `${apiUrl}/schedulers/job/${jobId}/status`,
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    cy.log(
                        `Job status (${retries}): ${resp.body.results.status}`,
                    );
                    if (
                        resp.body.results.status === 'completed' ||
                        resp.body.results.status === 'error'
                    ) {
                        expect(resp.body.results.status).to.eq('completed');
                        const { fileUrl } = resp.body.results.details;
                        cy.request({
                            url: fileUrl,
                            method: 'GET',
                            timeout: 120000,
                        }).then((fileResp) => {
                            expect(fileResp.status).to.eq(200);
                            const lines = fileResp.body.trim().split('\n');
                            const results = lines.map((line) =>
                                JSON.parse(line),
                            );

                            expect(results).to.have.length(50000);
                        });
                    } // Else keep polling
                    else if (retries < maxRetries) {
                        poll(retries + 1);
                    } else {
                        expect(
                            resp.body.results.status,
                            'Reached max number of retries without getting completed job',
                        ).to.eq('completed');
                    }
                });
            };
            poll();
        });
    });
});

describe(`Saved SQL chart`, () => {
    beforeEach(() => {
        cy.login();
    });

    it(`save & update SQL chart`, () => {
        // get spaces
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
        }).then((spaceResp) => {
            const space = spaceResp.body.results[0];

            const sqlChartToCreate: CreateSqlChart = {
                name: 'test',
                description: null,
                sql: 'SELECT * FROM postgres.jaffle.payments',
                limit: 21,
                config: {
                    display: {},
                    metadata: {
                        version: 1,
                    },
                    type: ChartKind.TABLE,
                    columns: {},
                },
                spaceUuid: space.uuid,
            };

            // create sql chart
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved`,
                headers: { 'Content-type': 'application/json' },
                method: 'POST',
                body: JSON.stringify(sqlChartToCreate),
            }).then((createResp) => {
                expect(createResp.status).to.eq(200);
                const { savedSqlUuid } = createResp.body.results;

                const sqlChartToUpdate: UpdateSqlChart = {
                    unversionedData: {
                        name: 'test update',
                        description: null,
                        spaceUuid: space.uuid,
                    },
                    versionedData: {
                        sql: 'SELECT * FROM postgres.jaffle.payments',
                        limit: 22,
                        config: {
                            display: {},
                            metadata: {
                                version: 1,
                            },
                            type: ChartKind.TABLE,
                            columns: {},
                        },
                    },
                };

                // Update sql chart
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'PATCH',
                    body: JSON.stringify(sqlChartToUpdate),
                }).then((updateResp) => {
                    expect(updateResp.status).to.eq(200);
                    // get sql chart
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`,
                    }).then((getResp) => {
                        expect(getResp.status).to.eq(200);
                        const { results } = getResp.body;
                        expect(results.name).to.be.eq('test update');
                        expect(results.sql).to.be.eq(
                            'SELECT * FROM postgres.jaffle.payments',
                        );

                        // delete sql chart
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/sqlRunner/saved/${savedSqlUuid}`,
                            headers: { 'Content-type': 'application/json' },
                            method: 'DELETE',
                        }).then((deleteResp) => {
                            expect(deleteResp.status).to.eq(200);
                        });
                    });
                });
            });
        });
    });
});

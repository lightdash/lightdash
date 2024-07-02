import { ApiWarehouseTableFields, WarehouseTypes } from '@lightdash/common';
import warehouseConnections from '../../support/warehouses';

const apiUrl = '/api/v1';

// Object.entries({'postgres': warehouseConnections.snowflake}).forEach( // For testing
Object.entries(warehouseConnections).forEach(
    ([warehouseName, warehouseConfig]) => {
        const getDatabaseDetails = () => {
            switch (warehouseConfig.type) {
                case WarehouseTypes.SNOWFLAKE:
                    return [
                        warehouseConfig.database.toLowerCase(),
                        warehouseConfig.schema.toLowerCase(),
                    ];
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
                    ['customers', 'orders', 'payments'].forEach((table) => {
                        expect(
                            Object.keys(resp.body.results[database][schema]),
                        ).to.include(table);
                    });
                    expect(
                        Object.keys(resp.body.results[database][schema].orders),
                    ).to.be.deep.eq([]);
                });
            });
            it(`Get fields for SQL runner ${warehouseName}`, () => {
                cy.request<ApiWarehouseTableFields>({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/tables/orders`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);

                    const { results } = resp.body;

                    expect(Object.keys(results)).to.have.length.gt(5);
                    ['order_id', 'status', 'amount'].forEach((table) => {
                        expect(Object.keys(results)).to.include(table);
                    });
                    expect(results.amount).to.be.eq('number');
                    expect(results.status).to.be.eq('string');
                    expect(results.is_completed).to.be.eq('boolean');
                    expect(results.order_date).to.be.eq('date');
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
                     FROM ${database}.${schema}.payments ORDER BY payment_id asc LIMIT 2`;

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
                            if (resp.body.results.status !== 'started') {
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
                                    expect(
                                        results[0].payment_id.value.raw,
                                    ).to.be.eq(1);
                                    expect(
                                        results[0].payment_id.value.formatted,
                                    ).to.be.eq('1');
                                    expect(
                                        results[0].payment_method.value.raw,
                                    ).to.be.eq('credit_card');
                                    expect(
                                        results[0].payment_method.value
                                            .formatted,
                                    ).to.be.eq('credit_card');
                                    // TODO FIX amount, DIfferent warehouses have different format
                                    // expect(results[0].amount.value.raw).to.be.eq("10.0000000000000000");

                                    expect(
                                        results[1].payment_id.value.raw,
                                    ).to.be.eq(2);
                                    expect(
                                        results[1].payment_method.value.raw,
                                    ).to.be.eq('credit_card');
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
    },
);

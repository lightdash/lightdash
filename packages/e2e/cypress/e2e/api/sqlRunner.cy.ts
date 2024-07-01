import { WarehouseTypes } from '@lightdash/common';
import warehouseConnections from '../../support/warehouses';

const apiUrl = '/api/v1';

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
                cy.request({
                    url: `${apiUrl}/projects/${projectUuid}/sqlRunner/tables/orders`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);

                    const [database, schema] = getDatabaseDetails();
                    expect(Object.keys(resp.body.results)).to.include(database);
                    const databaseResults = resp.body.results[database];
                    expect(Object.keys(databaseResults)).to.include(schema);
                    const schemaResults = databaseResults[schema];
                    expect(Object.keys(schemaResults)).to.include('orders');
                    expect(Object.keys(schemaResults)).to.not.include(
                        'customers',
                    );
                    const fieldResults = schemaResults.orders;

                    expect(Object.keys(fieldResults)).to.have.length.gt(5);
                    ['order_id', 'status', 'amount'].forEach((table) => {
                        expect(Object.keys(fieldResults)).to.include(table);
                    });
                    expect(fieldResults.amount).to.be.eq('number');
                    expect(fieldResults.status).to.be.eq('string');
                    expect(fieldResults.is_completed).to.be.eq('boolean');
                    expect(fieldResults.order_date).to.be.eq('date');
                });
            });
        });
    },
);

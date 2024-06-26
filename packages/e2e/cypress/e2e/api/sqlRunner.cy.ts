import { WarehouseTypes } from '@lightdash/common';
import warehouseConnections from '../../support/warehouses';

const apiUrl = '/api/v1';

Object.entries({ postgresSQL: warehouseConnections.bigQuery }).forEach(
    ([warehouseName, warehouseConfig]) => {
        const getDatabaseName = () => {
            switch (warehouseConfig.type) {
                case WarehouseTypes.SNOWFLAKE:
                    return warehouseConfig.database.toLowerCase();
                    break;
                case WarehouseTypes.BIGQUERY:
                    return warehouseConfig.dataset;
                    break;
                case WarehouseTypes.REDSHIFT:
                case WarehouseTypes.POSTGRES:
                    return warehouseConfig.dbname;
                default:
                    return 'unknown warehouse type';
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

                    const database = getDatabaseName();

                    expect(Object.keys(resp.body.results)).to.include(database);
                    expect(Object.keys(resp.body.results[database])).to.include(
                        'jaffle',
                    );
                    ['customers', 'orders', 'payments'].forEach((table) => {
                        expect(
                            Object.keys(resp.body.results[database].jaffle),
                        ).to.include(table);
                    });
                    expect(
                        Object.keys(resp.body.results[database].jaffle.orders),
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

                    const database = getDatabaseName();
                    expect(Object.keys(resp.body.results)).to.include(database);
                    expect(Object.keys(resp.body.results[database])).to.include(
                        'jaffle',
                    );
                    expect(
                        Object.keys(resp.body.results[database].jaffle),
                    ).to.include('orders');
                    expect(
                        Object.keys(resp.body.results[database].jaffle),
                    ).to.not.include('customers');
                    expect(
                        Object.keys(resp.body.results[database].jaffle.orders),
                    ).to.have.length.gt(5);
                    ['order_id', 'status', 'amount'].forEach((table) => {
                        expect(
                            Object.keys(
                                resp.body.results[database].jaffle.orders,
                            ),
                        ).to.include(table);
                    });
                    expect(
                        resp.body.results[database].jaffle.orders.amount,
                    ).to.be.eq('number');
                    expect(
                        resp.body.results[database].jaffle.orders.status,
                    ).to.be.eq('string');
                    expect(
                        resp.body.results[database].jaffle.orders.is_completed,
                    ).to.be.eq('boolean');
                    expect(
                        resp.body.results[database].jaffle.orders.order_date,
                    ).to.be.eq('date');
                });
            });
        });
    },
);

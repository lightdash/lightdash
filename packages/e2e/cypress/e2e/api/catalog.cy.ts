import {
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type CatalogField,
    type Space,
} from '@lightdash/common';
import { chartMock } from '../../support/mocks';
import { createSpace, deleteSpace } from '../../support/spaceUtils';
import { createChartAndUpdateDashboard, createDashboard } from './dashboard.cy';

const apiUrl = '/api/v1';

describe('Lightdash catalog all tables and fields', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should list all tables', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?type=table`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(0);
            const userTable = resp.body.results.find(
                (table) => table.name === 'users',
            );
            expect(userTable).to.eql({
                name: 'users',
                label: 'Users',
                description: 'users table',
                type: 'table',
                joinedTables: [],
                tags: [],
                categories: [],
                catalogSearchUuid: '',
                icon: null,
                aiHints: null,
            });
        });
    });

    it('Should list all fields', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?type=field`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(10);

            const dimension = resp.body.results.find(
                (field) =>
                    field.name === 'payment_method' &&
                    field.tableLabel === 'Payments',
            );
            expect(dimension).to.eql({
                name: 'payment_method',
                description: 'Method of payment used, for example credit card',
                tableLabel: 'Payments',
                tableName: 'payments',
                label: 'Payment method',
                fieldType: 'dimension',
                basicType: 'string',
                type: 'field',
                tags: [],
                categories: [],
                catalogSearchUuid: '',
                icon: null,
                aiHints: null,
                fieldValueType: 'string',
                owner: null,
            });

            const metric = resp.body.results.find(
                (field) =>
                    field.name === 'total_revenue' &&
                    field.tableLabel === 'Payments',
            );
            expect(metric).to.eql({
                name: 'total_revenue',
                description: 'Sum of all payments',
                tableLabel: 'Payments',
                tableName: 'payments',
                fieldType: 'metric',
                basicType: 'number',
                label: 'Total revenue',
                type: 'field',
                tags: [],
                categories: [],
                catalogSearchUuid: '',
                icon: null,
                aiHints: null,
                fieldValueType: 'sum',
                owner: null,
            });
        });
    });
});

describe('Lightdash catalog search', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should search for customer tables and fields', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=customer`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(10);

            const table = resp.body.results.find(
                (t) => t.name === 'customers' && t.type === 'table',
            );

            expect(table).to.have.property('name', 'customers');

            const field = resp.body.results.find(
                (f) => f.name === 'customer_id' && f.tableLabel === 'Users',
            );

            expect(field).to.have.property('name', 'customer_id');
        });
    });

    it('Should search for a metric (total_revenue) sorted by chartUsage', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/metrics?search=total_revenue&sort=chartUsage&order=desc`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);

            const { data } = resp.body.results;
            expect(data).to.have.length(4);

            const expectedDescriptions = [
                'Total revenue',
                'Total revenue from completed orders',
                'Sum of all payments',
                'Sum of annual revenue across offices',
            ];

            const actualDescriptions = data.map(
                (field: CatalogField) => field.description,
            );

            data.forEach((field: CatalogField) => {
                expect(field).to.have.property('name', 'total_revenue');
            });

            expectedDescriptions.forEach((desc) => {
                expect(actualDescriptions).to.include(desc);
            });
        });
    });

    it('Should search with partial word (cust)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=cust`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(0);

            // Check for a returned field
            const matchingField = resp.body.results.find(
                (f) =>
                    f.name === 'customer_id' &&
                    f.tableLabel === 'Users' &&
                    f.type === 'field',
            );

            expect(matchingField).to.have.property('name', 'customer_id');

            // Check for a table
            const matchingTable = resp.body.results.find(
                (t) => t.name === 'customers',
            );

            expect(matchingTable).to.have.property('name', 'customers');
        });
    });

    it('Should search with multiple words (order date)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=order%20date`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(0);

            const matchingField = resp.body.results.find(
                (f) => f.name === 'date_of_first_order' && f.type === 'field',
            );

            expect(matchingField).to.have.property(
                'description',
                'Min of Order date',
            );
        });
    });

    it('Should filter fields with required attributes (age)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=average_age`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(0);
        });
    });

    it('Should filter table with required attributes (memberships)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=memberships`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(0);
        });
    });
    describe('user attributes', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const requiredAttributeName = 'ua_required';
        const requiredAttributeName2 = 'ua_required_2';
        const anyAttributeName = 'ua_any';
        const anyAttributeName2 = 'ua_any_2';
        const caseFields = [
            'ua_case_1_none',
            'ua_case_2_any_only',
            'ua_case_3_required_only',
            'ua_case_4_required_and_any',
            'ua_case_5_required_pass_any_fail',
            'ua_case_6_any_pass_required_fail',
            'ua_case_7_required_multi_and_array',
            'ua_case_8_any_multi_and_array',
            'ua_case_9_both_multi_and_array',
        ];

        const getOrCreateAttribute = (name: string) =>
            cy.request('GET', `${apiUrl}/org/attributes`).then((response) => {
                const existing = response.body.results.find(
                    (attr: { name: string; uuid: string }) =>
                        attr.name === name,
                );
                if (existing) return existing.uuid;

                return cy
                    .request('POST', `${apiUrl}/org/attributes`, {
                        name,
                        users: [],
                        groups: [],
                        attributeDefault: null,
                    })
                    .then((createResponse) => createResponse.body.results.uuid);
            });

        const setAttributeValue = (
            attributeUuid: string,
            name: string,
            value: string | null,
        ) =>
            cy.request('PUT', `${apiUrl}/org/attributes/${attributeUuid}`, {
                name,
                users:
                    value === null
                        ? []
                        : [
                              {
                                  userUuid: SEED_ORG_1_ADMIN.user_uuid,
                                  value,
                              },
                          ],
                groups: [],
                attributeDefault: null,
            });

        const searchCaseFields = () =>
            cy
                .request(
                    `${apiUrl}/projects/${projectUuid}/dataCatalog?type=field&search=ua_case_`,
                )
                .then((response) => {
                    expect(response.status).to.eq(200);
                    return response.body.results
                        .filter(
                            (item: {
                                type: string;
                                tableName?: string;
                                name: string;
                            }) =>
                                item.type === 'field' &&
                                item.tableName ===
                                    'user_attribute_access_cases',
                        )
                        .map((item: { name: string }) => item.name);
                });

        let requiredAttributeUuid: string;
        let requiredAttributeUuid2: string;
        let anyAttributeUuid: string;
        let anyAttributeUuid2: string;

        before(() => {
            cy.login();
            getOrCreateAttribute(requiredAttributeName).then((uuid) => {
                requiredAttributeUuid = uuid;
            });
            getOrCreateAttribute(requiredAttributeName2).then((uuid) => {
                requiredAttributeUuid2 = uuid;
            });
            getOrCreateAttribute(anyAttributeName).then((uuid) => {
                anyAttributeUuid = uuid;
            });
            getOrCreateAttribute(anyAttributeName2).then((uuid) => {
                anyAttributeUuid2 = uuid;
            });
        });

        beforeEach(() => {
            cy.login();
        });

        after(() => {
            cy.login();
            setAttributeValue(
                requiredAttributeUuid,
                requiredAttributeName,
                null,
            );
            setAttributeValue(
                requiredAttributeUuid2,
                requiredAttributeName2,
                null,
            );
            setAttributeValue(anyAttributeUuid, anyAttributeName, null);
            setAttributeValue(anyAttributeUuid2, anyAttributeName2, null);
        });

        describe('required attributes', () => {
            it('should enforce required-only and multi-required cases', () => {
                setAttributeValue(
                    requiredAttributeUuid,
                    requiredAttributeName,
                    'yes',
                );
                setAttributeValue(
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    'ok',
                );
                setAttributeValue(anyAttributeUuid, anyAttributeName, null);
                setAttributeValue(anyAttributeUuid2, anyAttributeName2, null);

                searchCaseFields().then((visibleFieldNames) => {
                    expect(visibleFieldNames).to.include(caseFields[0]); // case 1
                    expect(visibleFieldNames).to.include(caseFields[2]); // case 3
                    expect(visibleFieldNames).to.include(caseFields[6]); // case 7
                    expect(visibleFieldNames).to.not.include(caseFields[1]); // case 2
                    expect(visibleFieldNames).to.not.include(caseFields[3]); // case 4
                    expect(visibleFieldNames).to.not.include(caseFields[8]); // case 9
                });
            });
            it('should hide multi-required fields when one required key is missing', () => {
                setAttributeValue(
                    requiredAttributeUuid,
                    requiredAttributeName,
                    'yes',
                );
                setAttributeValue(
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                setAttributeValue(anyAttributeUuid, anyAttributeName, 'a');
                setAttributeValue(anyAttributeUuid2, anyAttributeName2, 'b');

                searchCaseFields().then((visibleFieldNames) => {
                    expect(visibleFieldNames).to.not.include(caseFields[6]); // case 7
                    expect(visibleFieldNames).to.not.include(caseFields[8]); // case 9
                });
            });
        });

        describe('any attributes', () => {
            it('should enforce any-only and multi-any cases', () => {
                setAttributeValue(
                    requiredAttributeUuid,
                    requiredAttributeName,
                    null,
                );
                setAttributeValue(
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                setAttributeValue(anyAttributeUuid, anyAttributeName, 'a');
                setAttributeValue(anyAttributeUuid2, anyAttributeName2, null);

                searchCaseFields().then((visibleFieldNames) => {
                    expect(visibleFieldNames).to.include(caseFields[0]); // case 1
                    expect(visibleFieldNames).to.include(caseFields[1]); // case 2
                    expect(visibleFieldNames).to.include(caseFields[7]); // case 8
                    expect(visibleFieldNames).to.not.include(caseFields[2]); // case 3
                    expect(visibleFieldNames).to.not.include(caseFields[3]); // case 4
                });
            });
            it('should allow any via secondary key and array value matching', () => {
                setAttributeValue(
                    requiredAttributeUuid,
                    requiredAttributeName,
                    null,
                );
                setAttributeValue(
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                setAttributeValue(anyAttributeUuid, anyAttributeName, 'zzz');
                setAttributeValue(anyAttributeUuid2, anyAttributeName2, 'b');

                searchCaseFields().then((visibleFieldNames) => {
                    expect(visibleFieldNames).to.include(caseFields[7]); // case 8
                    expect(visibleFieldNames).to.not.include(caseFields[1]); // case 2
                });
            });
        });

        describe('both required and any attributes', () => {
            it('should enforce all mixed logic cases when both required and any are set', () => {
                setAttributeValue(
                    requiredAttributeUuid,
                    requiredAttributeName,
                    'yes',
                );
                setAttributeValue(
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    'ok',
                );
                setAttributeValue(anyAttributeUuid, anyAttributeName, 'a');
                setAttributeValue(anyAttributeUuid2, anyAttributeName2, null);

                searchCaseFields().then((visibleFieldNames) => {
                    expect(visibleFieldNames).to.include(caseFields[0]); // case 1
                    expect(visibleFieldNames).to.include(caseFields[1]); // case 2
                    expect(visibleFieldNames).to.include(caseFields[2]); // case 3
                    expect(visibleFieldNames).to.include(caseFields[3]); // case 4
                    expect(visibleFieldNames).to.not.include(caseFields[4]); // case 5
                    expect(visibleFieldNames).to.not.include(caseFields[5]); // case 6
                    expect(visibleFieldNames).to.include(caseFields[6]); // case 7
                    expect(visibleFieldNames).to.include(caseFields[7]); // case 8
                    expect(visibleFieldNames).to.include(caseFields[8]); // case 9
                });
            });

            it('should only show no-attribute field when user has no user-attribute values', () => {
                setAttributeValue(
                    requiredAttributeUuid,
                    requiredAttributeName,
                    null,
                );
                setAttributeValue(
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                setAttributeValue(anyAttributeUuid, anyAttributeName, null);
                setAttributeValue(anyAttributeUuid2, anyAttributeName2, null);

                searchCaseFields().then((visibleFieldNames) => {
                    expect(visibleFieldNames).to.include(caseFields[0]); // case 1
                    expect(visibleFieldNames).to.not.include(caseFields[1]); // case 2
                    expect(visibleFieldNames).to.not.include(caseFields[2]); // case 3
                    expect(visibleFieldNames).to.not.include(caseFields[3]); // case 4
                    expect(visibleFieldNames).to.not.include(caseFields[4]); // case 5
                    expect(visibleFieldNames).to.not.include(caseFields[5]); // case 6
                    expect(visibleFieldNames).to.not.include(caseFields[6]); // case 7
                    expect(visibleFieldNames).to.not.include(caseFields[7]); // case 8
                    expect(visibleFieldNames).to.not.include(caseFields[8]); // case 9
                });
            });
        });
    });
});

describe('Lightdash analytics', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should get analytics for customers table', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/customers/analytics`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.charts).to.have.length.gte(1);

            const chart = resp.body.results.charts.find(
                (c) => c.name === 'How many users were created each month ?',
            );

            expect(chart).to.have.property('dashboardName', null);
            expect(chart).to.have.property('spaceName', 'Jaffle shop');
            expect(chart).to.have.property(
                'name',
                'How many users were created each month ?',
            );
            expect(chart).to.have.property('uuid');
            expect(chart).to.have.property('spaceUuid');
        });
    });

    it('Should get analytics for payments table', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/payments/analytics`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.charts).to.have.length.gte(2); // at least 2

            const chart = resp.body.results.charts.find(
                (c) =>
                    c.name ===
                    'How much revenue do we have per payment method?',
            );
            expect(chart).to.have.property('dashboardName', null);
            expect(chart).to.have.property('spaceName', 'Jaffle shop');
            expect(chart).to.have.property(
                'name',
                'How much revenue do we have per payment method?',
            );
            expect(chart).to.have.property('uuid');
            expect(chart).to.have.property('spaceUuid');
        });
    });

    it('Should get analytics for charts within dashboards', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const time = new Date().getTime();
        const dashboardName = `Dashboard ${time}`;
        const chartName = `Chart within dashboard ${time}`;
        // create dashboard
        createDashboard(projectUuid, {
            name: dashboardName,
            tiles: [],
            tabs: [],
        }).then((newDashboard) => {
            // update dashboard with chart
            createChartAndUpdateDashboard(projectUuid, {
                ...chartMock,
                name: chartName,
                dashboardUuid: newDashboard.uuid,
                spaceUuid: null,
            }).then(({ dashboard: updatedDashboard }) => {
                cy.request(
                    `${apiUrl}/projects/${projectUuid}/dataCatalog/${chartMock.tableName}/analytics`,
                ).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results.charts).to.have.length.gte(1);

                    const chart = resp.body.results.charts.find(
                        (c) => c.name === chartName,
                    );
                    expect(chart).to.have.property(
                        'dashboardName',
                        dashboardName,
                    );
                    expect(chart).to.have.property('spaceName', 'Jaffle shop'); // default space
                    expect(chart).to.have.property('name', chartName);
                    expect(chart).to.have.property('uuid');
                    expect(chart).to.have.property(
                        'spaceUuid',
                        updatedDashboard.spaceUuid,
                    );
                });
            });
        });
    });

    it('Should get analytics for fields', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/payments/analytics/payment_method`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.charts).to.have.length.gte(3); // at least 3

            const chart = resp.body.results.charts.find(
                (c) =>
                    c.name ===
                    'How much revenue do we have per payment method?',
            );
            expect(chart).to.have.property('dashboardName', null);
            expect(chart).to.have.property('spaceName', 'Jaffle shop');
            expect(chart).to.have.property(
                'name',
                'How much revenue do we have per payment method?',
            );
            expect(chart).to.have.property('uuid');
            expect(chart).to.have.property('spaceUuid');
        });
    });
});

describe('Lightdash analytics - space access filtering', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    let privateSpace: Space;
    let privateChartUuid: string;
    let editorEmail: string;

    before(() => {
        cy.login();

        createSpace({
            name: `Private catalog test ${Date.now()}`,
            projectUuid,
            isPrivate: true,
        }).then((space) => {
            privateSpace = space;

            cy.createChartInSpace(projectUuid, {
                ...chartMock,
                name: `Private chart ${Date.now()}`,
                spaceUuid: space.uuid,
                dashboardUuid: null,
            }).then((chart) => {
                privateChartUuid = chart.uuid;
            });
        });

        cy.loginWithPermissions('member', [
            { role: 'editor', projectUuid },
        ]).then((email) => {
            editorEmail = email as unknown as string;
        });
    });

    after(() => {
        cy.login();
        deleteSpace(privateSpace.uuid, projectUuid);
    });

    it('Should not return charts from private spaces the user cannot access', () => {
        cy.loginWithEmail(editorEmail);

        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/${chartMock.tableName}/analytics`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);

            const chartUuids = resp.body.results.charts.map(
                (c: { uuid: string }) => c.uuid,
            );
            expect(chartUuids).to.not.include(privateChartUuid);
        });
    });
});

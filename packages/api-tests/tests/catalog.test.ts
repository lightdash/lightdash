import {
    CatalogField,
    CreateChartInDashboard,
    CreateChartInSpace,
    CreateDashboard,
    Dashboard,
    DashboardTileTypes,
    isDashboardVersionedFields,
    SavedChart,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    Space,
    UpdateDashboard,
} from '@lightdash/common';
import { ApiClient } from '../helpers/api-client';
import { login, loginWithEmail, loginWithPermissions } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';

const apiUrl = '/api/v1';

// -- Local helpers --

async function createSpace(
    client: ApiClient,
    opts: {
        name: string;
        projectUuid: string;
        isPrivate?: boolean;
    },
): Promise<Space> {
    const resp = await client.post<{ results: Space }>(
        `${apiUrl}/projects/${opts.projectUuid}/spaces`,
        {
            name: opts.name,
            isPrivate: opts.isPrivate ?? true,
        },
    );
    expect(resp.status).toBe(200);
    return resp.body.results;
}

async function deleteSpace(
    client: ApiClient,
    spaceUuid: string,
    projectUuid: string,
): Promise<void> {
    const resp = await client.delete(
        `${apiUrl}/projects/${projectUuid}/spaces/${spaceUuid}`,
    );
    expect(resp.status).toBe(200);
}

async function createDashboard(
    client: ApiClient,
    projectUuid: string,
    body: CreateDashboard,
): Promise<Dashboard> {
    const response = await client.post<{ results: Dashboard }>(
        `${apiUrl}/projects/${projectUuid}/dashboards`,
        body,
    );
    expect(response.status).toBe(201);
    return response.body.results;
}

async function updateDashboard(
    client: ApiClient,
    dashboardUuid: string,
    body: UpdateDashboard,
): Promise<Dashboard> {
    const response = await client.patch<{ results: Dashboard }>(
        `${apiUrl}/dashboards/${dashboardUuid}`,
        body,
    );
    expect(response.status).toBe(200);
    return response.body.results;
}

async function createChartAndUpdateDashboard(
    client: ApiClient,
    projectUuid: string,
    body: CreateChartInDashboard,
    dashboard?: UpdateDashboard,
): Promise<{ chart: SavedChart; dashboard: Dashboard }> {
    const response = await client.post<{ results: SavedChart }>(
        `${apiUrl}/projects/${projectUuid}/saved`,
        body,
    );
    expect(response.status).toBe(200);
    const newChart = response.body.results;
    expect(newChart.name).toBe(body.name);
    expect(newChart.dashboardUuid).toBe(body.dashboardUuid);

    const updatedDashboard = await updateDashboard(client, body.dashboardUuid, {
        ...dashboard,
        tabs: [],
        tiles: [
            ...(dashboard && isDashboardVersionedFields(dashboard)
                ? dashboard.tiles
                : []),
            {
                tabUuid: undefined,
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 0,
                h: 5,
                w: 5,
                properties: {
                    savedChartUuid: newChart.uuid,
                },
            },
        ],
    });

    return { chart: newChart, dashboard: updatedDashboard };
}

async function createChartInSpace(
    client: ApiClient,
    projectUuid: string,
    body: CreateChartInSpace,
): Promise<SavedChart> {
    const resp = await client.post<{ results: SavedChart }>(
        `${apiUrl}/projects/${projectUuid}/saved`,
        body,
    );
    expect(resp.status).toBe(200);
    return resp.body.results;
}

// -- Tests --

describe('Lightdash catalog all tables and fields', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should list all tables', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{ results: Array<{ name: string }> }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?type=table`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.length).toBeGreaterThan(0);

        const userTable = resp.body.results.find(
            (table) => table.name === 'users',
        );
        expect(userTable).toEqual({
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

    it('Should list all fields', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: Array<{ name: string; tableLabel?: string }>;
        }>(`${apiUrl}/projects/${projectUuid}/dataCatalog?type=field`);
        expect(resp.status).toBe(200);
        expect(resp.body.results.length).toBeGreaterThan(10);

        const dimension = resp.body.results.find(
            (field) =>
                field.name === 'payment_method' &&
                field.tableLabel === 'Payments',
        );
        expect(dimension).toEqual({
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
        expect(metric).toEqual({
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

describe('Lightdash catalog search', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should search for customer tables and fields', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: Array<{ name: string; type: string; tableLabel?: string }>;
        }>(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=customer`);
        expect(resp.status).toBe(200);
        expect(resp.body.results.length).toBeGreaterThan(10);

        const table = resp.body.results.find(
            (t) => t.name === 'customers' && t.type === 'table',
        );
        expect(table).toHaveProperty('name', 'customers');

        const field = resp.body.results.find(
            (f) => f.name === 'customer_id' && f.tableLabel === 'Users',
        );
        expect(field).toHaveProperty('name', 'customer_id');
    });

    it('Should search for a metric (total_revenue) sorted by chartUsage', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: { data: CatalogField[] };
        }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/metrics?search=total_revenue&sort=chartUsage&order=desc`,
        );
        expect(resp.status).toBe(200);

        const { data } = resp.body.results;
        expect(data).toHaveLength(5);

        const expectedDescriptions = [
            'Total revenue',
            'Total revenue from completed orders',
            'Sum of all payments',
            'Sum of Revenue attributed',
            'Sum of annual revenue across offices',
        ];

        const actualDescriptions = data.map(
            (field: CatalogField) => field.description,
        );

        data.forEach((field: CatalogField) => {
            expect(field).toHaveProperty('name', 'total_revenue');
        });

        expectedDescriptions.forEach((desc) => {
            expect(actualDescriptions).toContain(desc);
        });
    });

    it('Should search with partial word (cust)', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: Array<{ name: string; type: string; tableLabel?: string }>;
        }>(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=cust`);
        expect(resp.status).toBe(200);
        expect(resp.body.results.length).toBeGreaterThan(0);

        // Check for a returned field
        const matchingField = resp.body.results.find(
            (f) =>
                f.name === 'customer_id' &&
                f.tableLabel === 'Users' &&
                f.type === 'field',
        );
        expect(matchingField).toHaveProperty('name', 'customer_id');

        // Check for a table
        const matchingTable = resp.body.results.find(
            (t) => t.name === 'customers',
        );
        expect(matchingTable).toHaveProperty('name', 'customers');
    });

    it('Should search with multiple words (order date)', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: Array<{
                name: string;
                type: string;
                description?: string;
            }>;
        }>(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=order%20date`);
        expect(resp.status).toBe(200);
        expect(resp.body.results.length).toBeGreaterThan(0);

        const matchingField = resp.body.results.find(
            (f) => f.name === 'date_of_first_order' && f.type === 'field',
        );
        expect(matchingField).toHaveProperty(
            'description',
            'Min of Order date',
        );
    });

    it('Should filter fields with required attributes (age)', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{ results: unknown[] }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=average_age`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveLength(0);
    });

    it('Should filter table with required attributes (memberships)', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{ results: unknown[] }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=memberships`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveLength(0);
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

        let attrAdmin: ApiClient;
        let requiredAttributeUuid: string;
        let requiredAttributeUuid2: string;
        let anyAttributeUuid: string;
        let anyAttributeUuid2: string;

        async function getOrCreateAttribute(
            client: ApiClient,
            name: string,
        ): Promise<string> {
            const response = await client.get<{
                results: Array<{ name: string; uuid: string }>;
            }>(`${apiUrl}/org/attributes`);
            const existing = response.body.results.find(
                (attr) => attr.name === name,
            );
            if (existing) return existing.uuid;

            const createResponse = await client.post<{
                results: { uuid: string };
            }>(`${apiUrl}/org/attributes`, {
                name,
                users: [],
                groups: [],
                attributeDefault: null,
            });
            return createResponse.body.results.uuid;
        }

        async function setAttributeValue(
            client: ApiClient,
            attributeUuid: string,
            name: string,
            value: string | null,
        ): Promise<void> {
            await client.put(`${apiUrl}/org/attributes/${attributeUuid}`, {
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
        }

        async function searchCaseFields(client: ApiClient): Promise<string[]> {
            const response = await client.get<{
                results: Array<{
                    type: string;
                    tableName?: string;
                    name: string;
                }>;
            }>(
                `${apiUrl}/projects/${projectUuid}/dataCatalog?type=field&search=ua_case_`,
            );
            expect(response.status).toBe(200);
            return response.body.results
                .filter(
                    (item) =>
                        item.type === 'field' &&
                        item.tableName === 'user_attribute_access_cases',
                )
                .map((item) => item.name);
        }

        beforeAll(async () => {
            admin = await login();
            requiredAttributeUuid = await getOrCreateAttribute(
                admin,
                requiredAttributeName,
            );
            requiredAttributeUuid2 = await getOrCreateAttribute(
                admin,
                requiredAttributeName2,
            );
            anyAttributeUuid = await getOrCreateAttribute(
                admin,
                anyAttributeName,
            );
            anyAttributeUuid2 = await getOrCreateAttribute(
                admin,
                anyAttributeName2,
            );
        });

        afterAll(async () => {
            const cleanup = await login();
            await setAttributeValue(
                cleanup,
                requiredAttributeUuid,
                requiredAttributeName,
                null,
            );
            await setAttributeValue(
                cleanup,
                requiredAttributeUuid2,
                requiredAttributeName2,
                null,
            );
            await setAttributeValue(
                cleanup,
                anyAttributeUuid,
                anyAttributeName,
                null,
            );
            await setAttributeValue(
                cleanup,
                anyAttributeUuid2,
                anyAttributeName2,
                null,
            );
        });

        describe('required attributes', () => {
            it('should enforce required-only and multi-required cases', async () => {
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid,
                    requiredAttributeName,
                    'yes',
                );
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    'ok',
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid,
                    anyAttributeName,
                    null,
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid2,
                    anyAttributeName2,
                    null,
                );

                const visibleFieldNames = await searchCaseFields(admin);
                expect(visibleFieldNames).toContain(caseFields[0]); // case 1
                expect(visibleFieldNames).toContain(caseFields[2]); // case 3
                expect(visibleFieldNames).toContain(caseFields[6]); // case 7
                expect(visibleFieldNames).not.toContain(caseFields[1]); // case 2
                expect(visibleFieldNames).not.toContain(caseFields[3]); // case 4
                expect(visibleFieldNames).not.toContain(caseFields[8]); // case 9
            });

            it('should hide multi-required fields when one required key is missing', async () => {
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid,
                    requiredAttributeName,
                    'yes',
                );
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid,
                    anyAttributeName,
                    'a',
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid2,
                    anyAttributeName2,
                    'b',
                );

                const visibleFieldNames = await searchCaseFields(admin);
                expect(visibleFieldNames).not.toContain(caseFields[6]); // case 7
                expect(visibleFieldNames).not.toContain(caseFields[8]); // case 9
            });
        });

        describe('any attributes', () => {
            it('should enforce any-only and multi-any cases', async () => {
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid,
                    requiredAttributeName,
                    null,
                );
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid,
                    anyAttributeName,
                    'a',
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid2,
                    anyAttributeName2,
                    null,
                );

                const visibleFieldNames = await searchCaseFields(admin);
                expect(visibleFieldNames).toContain(caseFields[0]); // case 1
                expect(visibleFieldNames).toContain(caseFields[1]); // case 2
                expect(visibleFieldNames).toContain(caseFields[7]); // case 8
                expect(visibleFieldNames).not.toContain(caseFields[2]); // case 3
                expect(visibleFieldNames).not.toContain(caseFields[3]); // case 4
            });

            it('should allow any via secondary key and array value matching', async () => {
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid,
                    requiredAttributeName,
                    null,
                );
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid,
                    anyAttributeName,
                    'zzz',
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid2,
                    anyAttributeName2,
                    'b',
                );

                const visibleFieldNames = await searchCaseFields(admin);
                expect(visibleFieldNames).toContain(caseFields[7]); // case 8
                expect(visibleFieldNames).not.toContain(caseFields[1]); // case 2
            });
        });

        describe('both required and any attributes', () => {
            it('should enforce all mixed logic cases when both required and any are set', async () => {
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid,
                    requiredAttributeName,
                    'yes',
                );
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    'ok',
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid,
                    anyAttributeName,
                    'a',
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid2,
                    anyAttributeName2,
                    null,
                );

                const visibleFieldNames = await searchCaseFields(admin);
                expect(visibleFieldNames).toContain(caseFields[0]); // case 1
                expect(visibleFieldNames).toContain(caseFields[1]); // case 2
                expect(visibleFieldNames).toContain(caseFields[2]); // case 3
                expect(visibleFieldNames).toContain(caseFields[3]); // case 4
                expect(visibleFieldNames).not.toContain(caseFields[4]); // case 5
                expect(visibleFieldNames).not.toContain(caseFields[5]); // case 6
                expect(visibleFieldNames).toContain(caseFields[6]); // case 7
                expect(visibleFieldNames).toContain(caseFields[7]); // case 8
                expect(visibleFieldNames).toContain(caseFields[8]); // case 9
            });

            it('should only show no-attribute field when user has no user-attribute values', async () => {
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid,
                    requiredAttributeName,
                    null,
                );
                await setAttributeValue(
                    admin,
                    requiredAttributeUuid2,
                    requiredAttributeName2,
                    null,
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid,
                    anyAttributeName,
                    null,
                );
                await setAttributeValue(
                    admin,
                    anyAttributeUuid2,
                    anyAttributeName2,
                    null,
                );

                const visibleFieldNames = await searchCaseFields(admin);
                expect(visibleFieldNames).toContain(caseFields[0]); // case 1
                expect(visibleFieldNames).not.toContain(caseFields[1]); // case 2
                expect(visibleFieldNames).not.toContain(caseFields[2]); // case 3
                expect(visibleFieldNames).not.toContain(caseFields[3]); // case 4
                expect(visibleFieldNames).not.toContain(caseFields[4]); // case 5
                expect(visibleFieldNames).not.toContain(caseFields[5]); // case 6
                expect(visibleFieldNames).not.toContain(caseFields[6]); // case 7
                expect(visibleFieldNames).not.toContain(caseFields[7]); // case 8
                expect(visibleFieldNames).not.toContain(caseFields[8]); // case 9
            });
        });
    });
});

describe('Lightdash analytics', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should get analytics for customers table', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: { charts: any[] };
        }>(`${apiUrl}/projects/${projectUuid}/dataCatalog/customers/analytics`);
        expect(resp.status).toBe(200);
        expect(resp.body.results.charts.length).toBeGreaterThanOrEqual(1);

        const chart = resp.body.results.charts.find(
            (c: any) => c.name === 'How many users were created each month ?',
        );
        expect(chart).toHaveProperty('dashboardName', null);
        expect(chart).toHaveProperty('spaceName', 'Jaffle shop');
        expect(chart).toHaveProperty(
            'name',
            'How many users were created each month ?',
        );
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid');
    });

    it('Should get analytics for payments table', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: { charts: any[] };
        }>(`${apiUrl}/projects/${projectUuid}/dataCatalog/payments/analytics`);
        expect(resp.status).toBe(200);
        expect(resp.body.results.charts.length).toBeGreaterThanOrEqual(2);

        const chart = resp.body.results.charts.find(
            (c: any) =>
                c.name === 'How much revenue do we have per payment method?',
        );
        expect(chart).toHaveProperty('dashboardName', null);
        expect(chart).toHaveProperty('spaceName', 'Jaffle shop');
        expect(chart).toHaveProperty(
            'name',
            'How much revenue do we have per payment method?',
        );
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid');
    });

    it('Should get analytics for charts within dashboards', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const time = new Date().getTime();
        const dashboardName = `Dashboard ${time}`;
        const chartName = `Chart within dashboard ${time}`;

        // create dashboard
        const newDashboard = await createDashboard(admin, projectUuid, {
            name: dashboardName,
            tiles: [],
            tabs: [],
        });

        // update dashboard with chart
        const { dashboard: updatedDashboard } =
            await createChartAndUpdateDashboard(admin, projectUuid, {
                ...chartMock,
                name: chartName,
                dashboardUuid: newDashboard.uuid,
                spaceUuid: null,
            });

        const resp = await admin.get<{
            results: { charts: any[] };
        }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/${chartMock.tableName}/analytics`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.charts.length).toBeGreaterThanOrEqual(1);

        const chart = resp.body.results.charts.find(
            (c: any) => c.name === chartName,
        );
        expect(chart).toHaveProperty('dashboardName', dashboardName);
        expect(chart).toHaveProperty('spaceName');
        expect(chart.spaceName).toBeTruthy(); // dashboard's space (may vary by test order)
        expect(chart).toHaveProperty('name', chartName);
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid', updatedDashboard.spaceUuid);
    });

    it('Should get analytics for fields', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const resp = await admin.get<{
            results: { charts: any[] };
        }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/payments/analytics/payment_method`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results.charts.length).toBeGreaterThanOrEqual(3);

        const chart = resp.body.results.charts.find(
            (c: any) =>
                c.name === 'How much revenue do we have per payment method?',
        );
        expect(chart).toHaveProperty('dashboardName', null);
        expect(chart).toHaveProperty('spaceName', 'Jaffle shop');
        expect(chart).toHaveProperty(
            'name',
            'How much revenue do we have per payment method?',
        );
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid');
    });
});

describe('Lightdash analytics - space access filtering', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    let admin: ApiClient;
    let privateSpace: Space;
    let privateChartUuid: string;
    let editorEmail: string;

    beforeAll(async () => {
        admin = await login();

        privateSpace = await createSpace(admin, {
            name: `Private catalog test ${Date.now()}`,
            projectUuid,
            isPrivate: true,
        });

        const chart = await createChartInSpace(admin, projectUuid, {
            ...chartMock,
            name: `Private chart ${Date.now()}`,
            spaceUuid: privateSpace.uuid,
            dashboardUuid: null,
        });
        privateChartUuid = chart.uuid;

        const result = await loginWithPermissions('member', [
            { role: 'editor', projectUuid },
        ]);
        editorEmail = result.email;
    });

    afterAll(async () => {
        const cleanup = await login();
        await deleteSpace(cleanup, privateSpace.uuid, projectUuid);
    });

    it('Should not return charts from private spaces the user cannot access', async () => {
        const editorClient = await loginWithEmail(editorEmail);

        const resp = await editorClient.get<{
            results: { charts: Array<{ uuid: string }> };
        }>(
            `${apiUrl}/projects/${projectUuid}/dataCatalog/${chartMock.tableName}/analytics`,
        );
        expect(resp.status).toBe(200);

        const chartUuids = resp.body.results.charts.map(
            (c: { uuid: string }) => c.uuid,
        );
        expect(chartUuids).not.toContain(privateChartUuid);
    });
});

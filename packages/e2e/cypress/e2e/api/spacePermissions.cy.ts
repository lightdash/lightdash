import { Dashboard, SavedChart, SEED_PROJECT, Space } from '@lightdash/common';

const apiUrl = '/api/v1';

const chartBody = {
    tableName: 'customers',
    metricQuery: {
        dimensions: ['customers_customer_id'],
        metrics: [],
        filters: {},
        limit: 500,
        sorts: [{ fieldId: 'customers_customer_id', descending: false }],
        tableCalculations: [],
        additionalMetrics: [],
    },
    tableConfig: { columnOrder: ['customers_customer_id'] },
    chartConfig: {
        type: 'cartesian',
        config: { layout: {}, eChartsConfig: {} },
    },
    name: 'private chart',
};

const dashboardBody = {
    name: 'private dashboard',
    description: '',
    tiles: [],
    tabs: [],
};

const createPrivateChart = (
    callback: (space: Space, chart: SavedChart) => void,
) => {
    cy.request({
        url: `api/v1/projects/${SEED_PROJECT.project_uuid}/spaces`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: { name: 'private space' },
    }).then((spaceResponse) => {
        cy.request({
            url: `api/v1/projects/${SEED_PROJECT.project_uuid}/saved`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { ...chartBody, spaceUuid: spaceResponse.body.results.uuid },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            callback(spaceResponse.body.results, resp.body.results);
        });
    });
};

const deleteSpace = (spaceUuid: string) => {
    cy.request({
        url: `api/v1/projects/${SEED_PROJECT.project_uuid}/spaces/${spaceUuid}`,
        method: 'DELETE',
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });
};
const createPrivateDashboard = (
    callback: (space: Space, dashboard: Dashboard) => void,
) => {
    cy.request({
        url: `api/v1/projects/${SEED_PROJECT.project_uuid}/spaces`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: { name: 'private space' },
    }).then((spaceResponse) => {
        cy.request({
            url: `api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                ...dashboardBody,
                spaceUuid: spaceResponse.body.results.uuid,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(201);
            callback(spaceResponse.body.results, resp.body.results);
        });
    });
};

describe('Lightdash API tests for my own private spaces as admin', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should identify user', () => {
        cy.request(`${apiUrl}/user`).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.property(
                'email',
                'demo@lightdash.com',
            );
            expect(resp.body.results).to.have.property('role', 'admin');
        });
    });

    it('Should create private space', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { name: 'private space' },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            cy.log(resp.body.results);
            expect(resp.body.results).to.have.property('isPrivate', true);
            expect(resp.body.results).to.have.property('name', 'private space');
            expect(resp.body.results).to.have.property(
                'projectUuid',
                SEED_PROJECT.project_uuid,
            );

            deleteSpace(resp.body.results.uuid);
        });
    });

    it('Should create chart in private space', () => {
        createPrivateChart((space, chart) => {
            expect(space).to.have.property('isPrivate', true);
            expect(space).to.have.property('name', 'private space');

            expect(chart).to.have.property('spaceName', 'private space');
            expect(chart).to.have.property('spaceUuid', space.uuid);

            deleteSpace(space.uuid);
        });
    });

    it('Should create dashboard in private space', () => {
        createPrivateDashboard((space, dashboard) => {
            expect(space).to.have.property('isPrivate', true);
            expect(space).to.have.property('name', 'private space');

            expect(dashboard).to.have.property('spaceName', 'private space');
            expect(dashboard).to.have.property('spaceUuid', space.uuid);

            deleteSpace(space.uuid);
        });
    });
});

describe('Lightdash API tests for an editor accessing other private spaces', () => {
    let privateChart: SavedChart;
    let privateSpaceChart: Space;
    let privateSpaceDashboard: Space;

    let email;
    let privateDashboard: Dashboard;

    before(() => {
        cy.login();

        createPrivateChart((space, chart) => {
            privateChart = chart;
            privateSpaceChart = space;
        });
        createPrivateDashboard((space, dashboard) => {
            privateDashboard = dashboard;
            privateSpaceDashboard = space;
        });
        cy.loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
            email = e;
        });
    });

    after(() => {
        cy.login();
        deleteSpace(privateSpaceDashboard.uuid);
        deleteSpace(privateSpaceChart.uuid);
    });
    beforeEach(() => {
        cy.loginWithEmail(email);
    });

    it('Should not view charts in other private spaces', () => {
        cy.request({
            url: `${apiUrl}/saved/${privateChart.uuid}`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should not get results from  charts in other private spaces', () => {
        cy.request({
            url: `${apiUrl}/saved/${privateChart.uuid}/results`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should not updateMultiple charts in other private spaces', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved/`,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: [
                {
                    uuid: privateChart.uuid,
                    name: 'udpated name',
                    description: 'updated description',
                    spaceUuid: privateSpaceChart.uuid,
                },
            ],
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should not create chart in other private spaces', () => {
        cy.request({
            url: `api/v1/projects/${SEED_PROJECT.project_uuid}/saved`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { ...chartBody, spaceUuid: privateSpaceChart.uuid },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
    it('Should not toggle pinning on charts in other private spaces', () => {
        cy.request({
            url: `api/v1/saved/${privateChart.uuid}/pinning`,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });

    it('Should not create scheduler for dashboard in other private spaces', () => {
        const schedulerBody = {
            format: 'image',
            name: 'scheduler',
            cron: '0 9 * * 1',
            options: {},
            targets: [],
        };
        cy.request({
            url: `api/v1/dashboards/${privateDashboard.uuid}/schedulers`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: schedulerBody,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
        });
    });
});

describe('Lightdash API tests for an project admin accessing other private spaces', () => {
    let privateChart: SavedChart;
    let privateSpaceChart: Space;
    let privateSpaceDashboard: Space;

    let email;
    let privateDashboard: Dashboard;

    before(() => {
        cy.login();

        createPrivateChart((space, chart) => {
            privateChart = chart;
            privateSpaceChart = space;
        });
        createPrivateDashboard((space, dashboard) => {
            privateDashboard = dashboard;
            privateSpaceDashboard = space;
        });
        cy.loginWithPermissions('viewer', [
            {
                role: 'admin',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]).then((e) => {
            email = e;
        });
    });

    after(() => {
        cy.login();
        deleteSpace(privateSpaceDashboard.uuid);
        deleteSpace(privateSpaceChart.uuid);
    });
    beforeEach(() => {
        cy.loginWithEmail(email);
    });

    it('Should list private spaces', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            const privateSpace = resp.body.results.find(
                (space) => space.name === 'private space',
            );
            expect(privateSpace).to.not.eq(undefined);
        });
    });

    it('Should list private spaces or content in global search', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/private`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(
                resp.body.results.spaces.find(
                    (space) => space.name === 'private space',
                ),
            ).to.not.eq(undefined);
            expect(
                resp.body.results.savedCharts.find(
                    (chart) => chart.name === 'private chart',
                ),
            ).to.not.eq(undefined);
            expect(
                resp.body.results.dashboards.find(
                    (dashboard) => dashboard.name === 'private dashboard',
                ),
            ).to.not.eq(undefined);
        });
    });
    it('Should list private spaces', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            const privateSpace = resp.body.results.find(
                (space) => space.name === 'private space',
            );
            expect(privateSpace).to.not.eq(undefined);
        });
    });

    it('Should not list private dashboards', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards?includePrivate=false`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(
                resp.body.results.find(
                    (dashboard) => dashboard.name === 'private dashboard',
                ),
            ).to.eq(undefined);
        });
    });
    it('Should view charts in other private spaces', () => {
        cy.request({
            url: `${apiUrl}/saved/${privateChart.uuid}`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should get results from  charts in other private spaces', () => {
        cy.request({
            url: `${apiUrl}/saved/${privateChart.uuid}/results`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should updateMultiple charts in other private spaces', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved/`,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: [
                {
                    uuid: privateChart.uuid,
                    name: 'udpated name',
                    description: 'updated description',
                    spaceUuid: privateSpaceChart.uuid,
                },
            ],
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should create chart in other private spaces', () => {
        cy.request({
            url: `api/v1/projects/${SEED_PROJECT.project_uuid}/saved`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { ...chartBody, spaceUuid: privateSpaceChart.uuid },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });
    it('Should toggle pinning on charts in other private spaces', () => {
        cy.request({
            url: `api/v1/saved/${privateChart.uuid}/pinning`,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: {},
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Should create scheduler for dashboard in other private spaces', () => {
        const schedulerBody = {
            format: 'image',
            name: 'scheduler',
            cron: '0 9 * * 1',
            options: {},
            targets: [],
        };
        cy.request({
            url: `api/v1/dashboards/${privateDashboard.uuid}/schedulers`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: schedulerBody,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });
});

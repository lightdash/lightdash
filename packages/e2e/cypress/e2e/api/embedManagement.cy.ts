import { CreateEmbedJwt, DecodedEmbed, SEED_PROJECT } from '@lightdash/common';

const EMBED_API_PREFIX = `/api/v1/embed/${SEED_PROJECT.project_uuid}`;

const getEmbedConfig = () =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        method: 'GET',
    });
const replaceEmbedConfig = (dashboardUuids: string[]) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            dashboardUuids,
        },
    });
const updateEmbedConfigDashboards = (dashboardUuids: string[]) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/config/dashboards`,
        headers: { 'Content-type': 'application/json' },
        method: 'PATCH',
        body: {
            dashboardUuids,
        },
    });
const getEmbedUrl = (body: CreateEmbedJwt) =>
    cy.request({
        url: `${EMBED_API_PREFIX}/get-embed-url`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body,
    });

describe('Embed Management API', () => {
    let embedConfig: DecodedEmbed;

    before(() => {
        cy.login();
        // Get initial data
        getEmbedConfig().then((resp) => {
            expect(resp.status).to.eq(200);
            embedConfig = resp.body.results;
        });
    });

    beforeEach(() => {
        cy.login();
    });

    it('should get project embed configuration', () => {
        expect(embedConfig).to.not.eq(null);
        expect(embedConfig.projectUuid).to.eq(SEED_PROJECT.project_uuid);
        expect(embedConfig.dashboardUuids).to.have.length.greaterThan(0);
        expect(embedConfig.createdAt).to.not.eq(null);
        expect(embedConfig.user).to.not.eq(null);
        expect(embedConfig.secret).to.not.eq(null);
        expect(embedConfig.encodedSecret).to.eq(undefined);
    });

    it('should replace project embed configuration', () => {
        replaceEmbedConfig(embedConfig.dashboardUuids).then((updateResp) => {
            expect(updateResp.status).to.eq(201);
            // should have new secret
            expect(updateResp.body.results.secret).to.not.eq(
                embedConfig.secret,
            );
            expect(updateResp.body.results.dashboardUuids).to.have.members(
                embedConfig.dashboardUuids,
            );
        });
    });

    it('should update project embed allowed dashboards', () => {
        cy.request(`/api/v2/content?pageSize=999&contentTypes=dashboard`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const dashboardsUuids = resp.body.results.data.map(
                    (d: { uuid: string }) => d.uuid,
                );
                expect(dashboardsUuids).to.have.length.greaterThan(1);
                updateEmbedConfigDashboards(dashboardsUuids).then(
                    (updateResp) => {
                        expect(updateResp.status).to.eq(200);
                        getEmbedConfig().then((newConfigResp) => {
                            expect(newConfigResp.status).to.eq(200);
                            expect(
                                newConfigResp.body.results.dashboardUuids,
                            ).to.have.members(dashboardsUuids);
                        });
                    },
                );
            },
        );
    });

    it('should create embed url', () => {
        getEmbedUrl({
            content: {
                type: 'dashboard',
                dashboardUuid: embedConfig.dashboardUuids[0],
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.url).to.not.eq(null);
        });
    });
});

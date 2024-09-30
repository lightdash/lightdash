import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v2';
const projectUuid = SEED_PROJECT.project_uuid;

// TODO test different semantic layers (project config)
describe.skip('Lightdash semantic layer', () => {
    let views: any[];
    beforeEach(() => {
        cy.login();
    });
    it('Should get all views from semantic-layer', () => {
        cy.request(
            `${apiUrl}/projects/${projectUuid}/semantic-layer/views`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            views = resp.body.results;
            // TODO check response, it will depend on the client
        });
    });
    it('Should get all fields from semantic-layer', () => {
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/semantic-layer/views/${views[0].name}/query-fields`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: JSON.stringify({
                dimensions: [],
                metrics: [],
                timeDimensions: [],
            }),
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            // TODO check response, it will depend on the client
        });
    });

    // Now we get results only from streaming
    it.skip('Should get all results from semantic-layer', () => {
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/semantic-layer/results`,

            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: JSON.stringify({
                dimensions: ['organizations.demo_joins_orders_status'],
                metrics: ['organizations.total_acv'],
            }),
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            // TODO check response, it will depend on the client
        });
    });
    it('Should get SQL from semantic-layer', () => {
        cy.request({
            url: `${apiUrl}/projects/${projectUuid}/semantic-layer/sql`,

            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: JSON.stringify({
                dimensions: ['organizations.demo_joins_orders_status'],
                metrics: ['organizations.total_acv'],
            }),
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            // TODO check response, it will depend on the client
        });
    });
    // TODO test streaming results
});

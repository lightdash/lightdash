import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Explore API Authentication Tests', () => {
    it('Should get explore using session-based authentication', () => {
        // Login using the current auth flow with session
        cy.login();

        // Test the GetExplore endpoint using session authentication
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/explores/customers`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body).to.have.property('status', 'ok');
            expect(resp.body.results).to.have.property('name', 'customers');
            expect(resp.body.results).to.have.property('tables');
        });
    });

    it('Should get explore using JWT authentication with Lightdash embed token', () => {
        // Get JWT token using the new command
        cy.getJwtToken(SEED_PROJECT.project_uuid).then((jwtToken) => {
            // Test the GetExplore endpoint using JWT authentication
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/tables/customers`,
                method: 'GET',
                headers: {
                    'lightdash-embed-token': jwtToken,
                },
            }).then((resp) => {
                expect(resp.status).to.eq(200);
            });
        });
    });
});

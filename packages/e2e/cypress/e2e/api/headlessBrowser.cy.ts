import { SEED_ORG_1_ADMIN } from '@lightdash/common';
import fetch from 'node-fetch';

const apiUrl = '/api/v1';

describe('Lightdash headless browser', () => {
    it('Should test simple callback endpoint', () => {
        cy.request(`${apiUrl}/headless-browser/callback/callback-arg`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('flag', 'callback-arg');
            },
        );
    });

    it('Should make a single request to headless browser', () => {
        cy.request(`${apiUrl}/headless-browser/test/single-test`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const response = resp.body;

                expect(response.request).to.have.property(
                    'flag',
                    'single-test',
                );
                expect(response.response).to.have.property(
                    'flag',
                    'single-test',
                );
            },
        );
    });
    it.skip('Should make multiple concurrent requests to headless browser', async () => {
        const requests = Array.from(Array(5).keys()).map((flag) =>
            fetch(`${apiUrl}/headless-browser/test/${flag}`),
        );

        const responses = await Promise.all(requests);

        responses.map(async (response) => {
            const jsonResponse = await response.json();
            expect(jsonResponse.request.flag).to.be.equal(
                jsonResponse.response.flag,
            );
        });
    });

    it('Should return forbidden error with invalid token', () => {
        cy.request({
            url: `${apiUrl}/headless-browser/login/${SEED_ORG_1_ADMIN.user_uuid}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { token: 'invalid-token' },
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(403);
            expect(resp.body).to.have.property('status', 'error');
        });
    });
});

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
                const expectedRequest = [
                    ['browser', 'ws://headless-browser:3000'],
                    [
                        'url',
                        'http://lightdash-dev:3000/api/v1/headless-browser/callback/single-test',
                    ],
                    ['flag', 'single-test'],
                ];

                expectedRequest.forEach(([property, value]) =>
                    expect(response.request).to.have.property(property, value),
                );
                const expectedResponse = [['flag', 'single-test']];
                expectedResponse.forEach(([property, value]) =>
                    expect(response.response).to.have.property(property, value),
                );
            },
        );
    });
    it('Should make multiple concurrent requests to headless browser', async () => {
        const requests = Array.from(Array(10).keys()).map((flag) =>
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
});

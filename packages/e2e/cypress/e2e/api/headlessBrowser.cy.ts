import fetch from 'node-fetch';

const apiUrl = '/api/v1';

describe('Lightdash headless browser', () => {
    it('Should make a single request to headless browser', () => {
        cy.request(`${apiUrl}/test-headless-browser/single-test`).then(
            (resp) => {
                expect(resp.status).to.eq(200);
                const response = resp.body;
                const expectedRequest = [
                    ['browser', 'ws://headless-browser:3000'],
                    [
                        'url',
                        'http://lightdash-dev:3000/api/v1/test-headless-browser-callback/single-test',
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
            fetch(`${apiUrl}/test-headless-browser/${flag}`),
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

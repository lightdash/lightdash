import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Lightdash API tests for my own private spaces as admin', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should not create duplicate slugs in the same project', () => {
        const spaceName = `📈 Space Namè ${Date.now()}`;
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { name: spaceName },
        }).then((res1) => {
            expect(res1.status).to.eq(200);

            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                headers: { 'Content-type': 'application/json' },
                method: 'POST',
                body: { name: spaceName },
            }).then((res2) => {
                expect(res2.status).to.eq(200);
                expect(res2.body.results.slug).to.not.eq(
                    res1.body.results.slug,
                );
            });
        });
    });

    it('Should not create duplicate slugs in the same project for nested spaces', () => {
        const spaceName = `📈 Space Namè ${Date.now()}`;
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: { name: spaceName },
        }).then((res1) => {
            expect(res1.status).to.eq(200);

            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                headers: { 'Content-type': 'application/json' },
                method: 'POST',
                body: {
                    name: spaceName,
                    parentSpaceUuid: res1.body.results.uuid,
                },
            }).then((res2) => {
                expect(res2.status).to.eq(200);
                expect(res2.body.results.slug).to.not.eq(
                    res1.body.results.slug,
                );
            });
        });
    });
});

import { SEED_GROUP, SEED_ORG_1_ADMIN } from '@lightdash/common';

describe('Attributes API', () => {
    beforeEach(() => {
        cy.login();
    });

    it('creates an attribute with users and groups', () => {
        const name = `example_attribute${Math.random()}`;

        const createBody = {
            name,
            users: [
                { userUuid: SEED_ORG_1_ADMIN.user_uuid, value: 'User Value' },
            ],
            groups: [{ groupUuid: SEED_GROUP.groupUuid, value: 'Group Value' }],
            attributeDefault: null,
        };

        cy.request('POST', '/api/v1/org/attributes', createBody).then(
            (response) => {
                expect(response.status).to.eq(201);

                const { uuid } = response.body.results;
                cy.request('GET', `/api/v1/org/attributes`).then(
                    (getResponse) => {
                        const attribute = getResponse.body.results.find(
                            (a) => a.uuid === uuid,
                        );
                        expect(attribute.name).to.eq(name);
                        expect(attribute.users).to.have.length(1);
                        expect(attribute.users[0].userUuid).to.eq(
                            SEED_ORG_1_ADMIN.user_uuid,
                        );
                        expect(attribute.users[0].value).to.eq('User Value');
                        expect(attribute.groups).to.have.length(1);
                        expect(attribute.groups[0].groupUuid).to.eq(
                            SEED_GROUP.groupUuid,
                        );
                        expect(attribute.groups[0].value).to.eq('Group Value');
                        cy.request('DELETE', `/api/v1/org/attributes/${uuid}`);
                    },
                );
            },
        );
    });
    it('creates an empty attribute and updates with users and groups', () => {
        const name = `example_attribute${Math.random()}`;
        const newName = `example_attribute${Math.random()}`;

        cy.request('POST', '/api/v1/org/attributes', {
            name,
            users: [],
            groups: [],
            attributeDefault: null,
        }).then((response) => {
            expect(response.status).to.eq(201);
            expect(response.body.results.users).to.have.length(0);
            expect(response.body.results.groups).to.have.length(0);

            const { uuid } = response.body.results;
            cy.request('PUT', `/api/v1/org/attributes/${uuid}`, {
                name: newName,
                users: [
                    {
                        userUuid: SEED_ORG_1_ADMIN.user_uuid,
                        value: 'User Value',
                    },
                ],
                groups: [
                    { groupUuid: SEED_GROUP.groupUuid, value: 'Group Value' },
                ],
                attributeDefault: null,
            }).then((patchResponse) => {
                expect(patchResponse.body.results.name).to.eq(newName);
                expect(patchResponse.body.results.users).to.have.length(1);
                expect(patchResponse.body.results.users[0].userUuid).to.eq(
                    SEED_ORG_1_ADMIN.user_uuid,
                );
                expect(patchResponse.body.results.users[0].value).to.eq(
                    'User Value',
                );
                expect(patchResponse.body.results.groups).to.have.length(1);
                expect(patchResponse.body.results.groups[0].groupUuid).to.eq(
                    SEED_GROUP.groupUuid,
                );
                expect(patchResponse.body.results.groups[0].value).to.eq(
                    'Group Value',
                );
                cy.request('DELETE', `/api/v1/org/attributes/${uuid}`);
            });
        });
    });
});

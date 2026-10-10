import {
    SEED_PROJECT,
    type ApiCreateUserAttributeResponse,
    type ApiUserAttributesResponse,
    type CreateUserAttribute,
    type UserAttribute,
} from '@lightdash/common';

const apiUrl = '/api/v1';

describe('User attributes', () => {
    const email = `user-attributes-${Date.now()}-${Cypress._.random(1_000_000)}@lightdash.com`;
    let userUuid: string | null = null;
    const createdAttributeUuids = new Set<string>();
    const attributeNames = ['customer_id', 'is_admin'];

    const toAttributeBody = (
        attribute: UserAttribute,
    ): CreateUserAttribute => ({
        name: attribute.name,
        description: attribute.description,
        attributeDefaults: attribute.attributeDefaults,
        users: attribute.users.map(({ userUuid: uuid, values }) => ({
            userUuid: uuid,
            values,
        })),
        groups: attribute.groups.map(({ groupUuid, values }) => ({
            groupUuid,
            values,
        })),
    });

    const setUserAttribute = (name: string, values: string[]) =>
        cy
            .request<ApiUserAttributesResponse>(`${apiUrl}/org/attributes`)
            .then(({ body }) => {
                const attribute = body.results.find(
                    (attr) => attr.name === name,
                );
                expect(attribute, `${name} definition`).not.to.eq(undefined);
                expect(userUuid, 'dedicated user').to.be.a('string');
                const payload = toAttributeBody(attribute!);
                payload.users = payload.users.filter(
                    (user) => user.userUuid !== userUuid,
                );
                if (values.length > 0) {
                    payload.users.push({ userUuid: userUuid!, values });
                }
                return cy
                    .request({
                        url: `${apiUrl}/org/attributes/${attribute!.uuid}`,
                        method: 'PUT',
                        body: payload,
                    })
                    .its('status')
                    .should('eq', 201);
            });

    const openAttribute = (name: string) => {
        cy.visit('/generalSettings/userAttributes');
        cy.findByText(name, { exact: true })
            .parents('tr')
            .find('button')
            .first()
            .click();
        cy.findByText('Edit').click();
    };

    const getUserAttributeRow = () =>
        cy
            .get(`input[name$=".userUuid"][value="${userUuid}"]`)
            .closest('.mantine-Group-root');

    const saveAttribute = () => {
        cy.findByRole('button', { name: 'Update' }).click();
        cy.contains('Success', { timeout: 10000 });
    };

    before(() => {
        cy.login();
        cy.request({
            url: `${apiUrl}/invite-links`,
            method: 'POST',
            body: {
                email,
                role: 'admin',
                expiresAt: new Date(
                    Date.now() + 24 * 60 * 60 * 1000,
                ).toISOString(),
            },
        }).then(({ status, body }) => {
            expect(status).to.eq(201);
            userUuid = body.results.userUuid;
            cy.registerWithCode(body.results.inviteCode);
            cy.verifyEmail();
        });
        cy.loginWithEmail(email);
        cy.request({
            url: `${apiUrl}/user/me/complete`,
            method: 'PATCH',
            body: {
                jobTitle: 'Engineering',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: false,
                isTrackingAnonymized: false,
            },
        })
            .its('status')
            .should('eq', 200);
        attributeNames.forEach((name) => {
            cy.request<ApiUserAttributesResponse>(
                `${apiUrl}/org/attributes`,
            ).then(({ body }) => {
                const attribute = body.results.find(
                    (attr) => attr.name === name,
                );
                if (attribute) {
                    expect(
                        attribute.attributeDefaults ?? [],
                        `${name} must have no default for missing-value tests`,
                    ).to.deep.eq([]);
                } else {
                    cy.request<ApiCreateUserAttributeResponse>({
                        url: `${apiUrl}/org/attributes`,
                        method: 'POST',
                        body: {
                            name,
                            attributeDefaults: null,
                            users: [],
                            groups: [],
                        },
                    }).then((response) => {
                        expect(response.status).to.eq(201);
                        createdAttributeUuids.add(response.body.results.uuid);
                    });
                }
            });
        });
    });

    beforeEach(() => {
        cy.loginWithEmail(email);
    });

    after(() => {
        if (!userUuid) return;
        cy.login();
        attributeNames.forEach((name) => {
            cy.request<ApiUserAttributesResponse>(
                `${apiUrl}/org/attributes`,
            ).then(({ body }) => {
                const attribute = body.results.find(
                    (attr) => attr.name === name,
                );
                if (!attribute) return;
                const payload = toAttributeBody(attribute);
                payload.users = payload.users.filter(
                    (user) => user.userUuid !== userUuid,
                );
                if (
                    createdAttributeUuids.has(attribute.uuid) &&
                    payload.users.length === 0 &&
                    payload.groups.length === 0 &&
                    (payload.attributeDefaults ?? []).length === 0 &&
                    !payload.description
                ) {
                    cy.request(
                        'DELETE',
                        `${apiUrl}/org/attributes/${attribute.uuid}`,
                    )
                        .its('status')
                        .should('eq', 200);
                } else if (payload.users.length !== attribute.users.length) {
                    cy.request({
                        url: `${apiUrl}/org/attributes/${attribute.uuid}`,
                        method: 'PUT',
                        body: payload,
                    })
                        .its('status')
                        .should('eq', 201);
                }
            });
        });
        cy.request('DELETE', `${apiUrl}/org/user/${userUuid}`)
            .its('status')
            .should('eq', 200);
    });

    describe('User attributes sql_filter', () => {
        before(() => {
            cy.loginWithEmail(email);
            setUserAttribute('customer_id', []);
        });
        it('Error on runquery if user attribute has no value', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByPlaceholderText('Search tables').type('Users');
            cy.findByText('Users').click();
            cy.findByText('First name').click();

            cy.get('button').contains('Run query').click();

            cy.contains('Error loading results');

            cy.contains(
                'Invalid or missing user attribute "customer_id": "customer_id = $' +
                    '{ld.attr.customer_id}"',
            );
        });

        it('Add a value for the dedicated user', () => {
            openAttribute('customer_id');
            cy.findByText('Add user').click();
            cy.findAllByPlaceholderText('E.g. test@lightdash.com')
                .last()
                .type(email);
            cy.findByRole('option', { name: email }).click();
            getUserAttributeRow().within(() => {
                cy.findByPlaceholderText('E.g. US (press Enter to add)').type(
                    '20{enter}',
                );
            });
            saveAttribute();
        });

        it('Should return results with user attribute', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByPlaceholderText('Search tables').type('Users');
            cy.findByText('Users').click();
            cy.findByText('First name').click();

            cy.get('button').contains('Run query').click();
            cy.contains('Anna');
        });

        it('Edit the dedicated user value', () => {
            openAttribute('customer_id');
            getUserAttributeRow().within(() => {
                cy.get('.mantine-Pill-remove').click();
                cy.findByPlaceholderText('E.g. US (press Enter to add)').type(
                    '30{enter}',
                );
            });
            saveAttribute();
        });
        it('Should return results with new user attribute', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByPlaceholderText('Search tables').type('Users');
            cy.findByText('Users').click();
            cy.findByText('First name').click();

            cy.get('button').contains('Run query').click();
            cy.contains('Christina', { timeout: 30000 });
        });
    });

    describe('User attributes dimension required_attribute', () => {
        before(() => {
            cy.loginWithEmail(email);
            setUserAttribute('customer_id', ['30']);
            setUserAttribute('is_admin', []);
        });
        it('Should not see last_name dimension', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByPlaceholderText('Search tables').type('Users');
            cy.findByText('Users').click();
            cy.findByText('Last name').should('not.exist');
        });

        it('Add a value for the dedicated user', () => {
            openAttribute('is_admin');
            cy.findByText('Add user').click();
            cy.findAllByPlaceholderText('E.g. test@lightdash.com')
                .last()
                .type(email);
            cy.findByRole('option', { name: email }).click();
            getUserAttributeRow().within(() => {
                cy.findByPlaceholderText('E.g. US (press Enter to add)').type(
                    'true{enter}',
                );
            });
            saveAttribute();
        });

        it('Should see last_name attribute', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByPlaceholderText('Search tables').type('Users');
            cy.findByText('Users').click();
            cy.findByText('Last name').click();

            cy.get('button').contains('Run query').click();
            cy.contains('W.', { timeout: 30000 });
        });

        it('Edit the dedicated user value', () => {
            openAttribute('is_admin');
            getUserAttributeRow().within(() => {
                cy.get('.mantine-Pill-remove').click();
                cy.findByPlaceholderText('E.g. US (press Enter to add)').type(
                    'false{enter}',
                );
            });
            saveAttribute();
        });
        it('Should not see last_name dimension', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByPlaceholderText('Search tables').type('Users');
            cy.findByText('Users').click();
            cy.findByText('Last name').should('not.exist');
        });
    });
});

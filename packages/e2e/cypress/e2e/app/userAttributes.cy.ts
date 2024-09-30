import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('User attributes sql_filter', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Delete customer_id attribute', () => {
        cy.request(`${apiUrl}/org/attributes`).then((resp) => {
            expect(resp.status).to.eq(200);
            const customerIdAttr = resp.body.results.find(
                (attr) => attr.name === 'customer_id',
            );
            if (customerIdAttr)
                cy.request({
                    url: `${apiUrl}/org/attributes/${customerIdAttr.uuid}`,
                    method: 'DELETE',
                }).then((r) => {
                    expect(r.status).to.eq(200);
                });
        });
    });
    it('Error on runquery if user attribute does not exist', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Users').click();
        cy.findByText('First name').click();

        // run query
        cy.get('button').contains('Run query').click();

        cy.contains('Error running query');

        cy.contains(
            // eslint-disable-next-line no-template-curly-in-string
            'Missing user attribute "customer_id" on sql_filter: "customer_id = ${ld.attr.customer_id}"',
        );
    });

    it('Create user attribute', () => {
        cy.visit(`/generalSettings/userAttributes`);
        cy.findByText('Add new attribute').click();

        cy.get('input[name="name"]').type('customer_id');
        cy.findByText('Add user').click();
        cy.findByPlaceholderText('E.g. test@lightdash.com').type('demo');
        cy.findByText('demo@lightdash.com').click();
        cy.get('input[name="users.0.value"]').type('20');
        cy.findByText('Add').click();
        cy.contains('Success');
    });

    it('Should return results with user attribute', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Users').click();
        cy.findByText('First name').click();

        // run query
        cy.get('button').contains('Run query').click();
        cy.contains('Anna');
    });

    it('Edit user attribute', () => {
        cy.visit(`/generalSettings/userAttributes`);

        cy.contains('customer_id').parents('tr').find('button').first().click();
        cy.get('input[name="users.0.value"]').clear().type('30');
        cy.findByText('Update').click();
        cy.contains('Success');
    });
    it('Should return results with new user attribute', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Users').click();
        cy.findByText('First name').click();

        // run query
        cy.get('button').contains('Run query').click();
        cy.contains('Christina');
    });
});

describe('User attributes dimension required_attribute', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Create customer_id attribute', () => {
        // This could fail if the attribute already exists
        cy.request({
            url: `${apiUrl}/org/attributes`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                name: 'customer_id',
                users: [
                    {
                        userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
                        value: '30',
                    },
                ],
                attributeDefault: undefined,
            },
            failOnStatusCode: false,
        });
    });
    it('Delete is_admin attribute', () => {
        cy.request(`${apiUrl}/org/attributes`).then((resp) => {
            expect(resp.status).to.eq(200);
            const customerIdAttr = resp.body.results.find(
                (attr) => attr.name === 'is_admin',
            );
            if (customerIdAttr)
                cy.request({
                    url: `${apiUrl}/org/attributes/${customerIdAttr.uuid}`,
                    method: 'DELETE',
                }).then((r) => {
                    expect(r.status).to.eq(200);
                });
        });
    });
    it('Should not see last_name dimension', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Users').click();
        cy.findByText('Last name').should('not.exist');
    });

    it('Create user attribute', () => {
        cy.visit(`/generalSettings/userAttributes`);
        cy.findByText('Add new attribute').click();

        cy.get('input[name="name"]').type('is_admin');
        cy.findByText('Add user').click();
        cy.findByPlaceholderText('E.g. test@lightdash.com').type('demo');
        cy.findByText('demo@lightdash.com').click();
        cy.get('input[name="users.0.value"]').type('true');
        cy.findByText('Add').click();
        cy.contains('Success');
    });

    it('Should see last_name attribute', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Users').click();
        cy.findByText('Last name').click();

        // run query
        cy.get('button').contains('Run query').click();
        cy.contains('W.');
    });

    it('Edit user attribute', () => {
        cy.visit(`/generalSettings/userAttributes`);

        cy.contains('is_admin').parents('tr').find('button').first().click();
        cy.get('input[name="users.0.value"]').clear().type('false');
        cy.findByText('Update').click();
        cy.contains('Success');
    });
    it('Should not see last_name dimension', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Users').click();
        cy.findByText('Last name').should('not.exist');
    });
});

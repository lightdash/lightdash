import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('User attributes', () => {
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
        cy.findByText('Add new attributes').click();

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

        cy.contains('customer_id').parents('tr').contains('Edit').click();
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

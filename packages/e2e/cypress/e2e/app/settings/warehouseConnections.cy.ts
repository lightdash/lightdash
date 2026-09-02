const CREDENTIALS_NAME = 'Athena test';
const UPDATED_CREDENTIALS_NAME = `${CREDENTIALS_NAME} updated`;

type WarehouseCredentialsResponse = {
    status: 'ok';
    results: {
        uuid: string;
        name: string;
        credentials: {
            type: string;
            accessKeyId?: string;
            secretAccessKey?: string;
        };
    }[];
};

const openCredentialsMenu = (name: string) =>
    cy
        .findByRole('row', {
            name: `${name} Athena All projects`,
        })
        .should('be.visible')
        .within(() => cy.findByRole('button').click());

const cleanupTestCredentials = () =>
    cy
        .request<WarehouseCredentialsResponse>(
            'GET',
            'api/v1/user/warehouseCredentials',
        )
        .then(({ body }) => {
            const testCredentials = body.results.filter(({ name }) =>
                [CREDENTIALS_NAME, UPDATED_CREDENTIALS_NAME].includes(name),
            );

            cy.wrap(testCredentials).each(({ uuid }) =>
                cy.request(
                    'DELETE',
                    `api/v1/user/warehouseCredentials/${uuid}`,
                ),
            );
        });

describe('Settings - Warehouse connections', () => {
    beforeEach(() => {
        cy.login();
        cleanupTestCredentials();
    });

    afterEach(() => {
        cleanupTestCredentials();
    });

    it('creates and edits Athena personal credentials', () => {
        cy.visit('/generalSettings/myWarehouseConnections');
        cy.findByRole('button', { name: 'Add credentials' }).click();

        cy.findByRole('dialog').within(() => {
            cy.findByRole('textbox', { name: 'Name' }).type(CREDENTIALS_NAME);
            cy.findByRole('textbox', { name: 'Warehouse' }).click();
        });
        cy.findByRole('option', { name: 'Athena' }).click();

        cy.findByRole('dialog').within(() => {
            cy.findByRole('textbox', { name: 'AWS access key ID' })
                .should('be.visible')
                .type('dummy-athena-access-key');
            cy.findByLabelText(/AWS secret access key/)
                .should('be.visible')
                .type('dummy-athena-secret-key');
            cy.findByRole('button', { name: 'Save' }).click();
        });

        cy.findByText('Success! Warehouse connection was created.').should(
            'be.visible',
        );
        openCredentialsMenu(CREDENTIALS_NAME);

        cy.findByRole('menuitem', { name: 'Edit' }).click();
        cy.findByRole('dialog').within(() => {
            cy.findByRole('textbox', { name: 'Name' })
                .should('have.value', CREDENTIALS_NAME)
                .clear()
                .type(UPDATED_CREDENTIALS_NAME);
            cy.findByRole('textbox', { name: 'AWS access key ID' }).should(
                'have.value',
                'dummy-athena-access-key',
            );
            cy.findByLabelText(/AWS secret access key/).should(
                'have.value',
                '',
            );
            cy.findByText(
                'Leave blank to keep the current secret access key.',
            ).should('be.visible');
            cy.findByRole('button', { name: 'Save' }).click();
        });

        cy.findByText('Success! Warehouse connection was updated.').should(
            'be.visible',
        );
        cy.findByRole('row', {
            name: `${UPDATED_CREDENTIALS_NAME} Athena All projects`,
        }).should('be.visible');

        openCredentialsMenu(UPDATED_CREDENTIALS_NAME);
        cy.findByRole('menuitem', { name: 'Edit' }).click();
        cy.findByRole('dialog').within(() => {
            cy.findByRole('textbox', { name: 'AWS access key ID' })
                .should('have.value', 'dummy-athena-access-key')
                .clear()
                .type('updated-dummy-athena-access-key');
            cy.findByRole('button', { name: 'Save' }).click();
            cy.findByText(
                'Enter the AWS secret access key for this access key ID.',
            ).should('be.visible');
            cy.findByLabelText(/AWS secret access key/).type(
                'updated-dummy-athena-secret-key',
            );
            cy.findByRole('button', { name: 'Save' }).click();
        });

        cy.findByText('Success! Warehouse connection was updated.').should(
            'be.visible',
        );
        cy.request<WarehouseCredentialsResponse>(
            'GET',
            'api/v1/user/warehouseCredentials',
        ).then(({ body }) => {
            const updated = body.results.find(
                ({ name }) => name === UPDATED_CREDENTIALS_NAME,
            );
            expect(updated?.credentials).to.deep.equal({
                type: 'athena',
                accessKeyId: 'updated-dummy-athena-access-key',
            });
        });
    });
});

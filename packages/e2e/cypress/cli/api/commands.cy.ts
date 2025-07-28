const cliCommand = `lightdash`;
const lightdashUrl = Cypress.config('baseUrl');

describe('help', () => {
    it('Should test lightdash command help', () => {
        cy.exec(`${cliCommand} help`)
            .its('stdout')
            .should('contain', 'Developer tools for dbt and Lightdash.');
    });
});

describe('version', () => {
    it('Should get version', () => {
        cy.exec(`${cliCommand} --version`)
            .its('stdout')
            .should('contain', '0.');
    });
});

describe('login', () => {
    it('Should lightdash login with token', () => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(`${cliCommand} login ${lightdashUrl} --token ${apiToken}`, {
                failOnNonZeroExit: false,
                env: {
                    NODE_ENV: 'development',
                    CI: true,
                },
            })
                .its('stderr')
                .should('contain', 'Login successful');
        });
    });
});

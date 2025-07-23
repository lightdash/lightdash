describe('CLI', () => {
    const cliCommand = `lightdash`;

    after(() => {});

    it('Should test lightdash command help', () => {
        cy.exec(`${cliCommand} help`)
            .its('stdout')
            .should('contain', 'Developer tools for dbt and Lightdash.');
    });
    it('Should get version', () => {
        cy.exec(`${cliCommand} --version`)
            .its('stdout')
            .should('contain', '0.');
    });
});

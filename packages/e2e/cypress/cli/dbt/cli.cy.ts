describe('CLI', () => {
    const projectDir = `../../examples/full-jaffle-shop-demo/dbt`;
    const profilesDir = `../../examples/full-jaffle-shop-demo/profiles`;
    const cliCommand = `lightdash`;

    const databaseEnvVars = {
        PGHOST: Cypress.env('PGHOST') ?? 'localhost',
        PGPORT: Cypress.env('PGPORT') ?? '5432',
        PGUSER: Cypress.env('PGUSER') ?? 'postgres',
        PGPASSWORD: Cypress.env('PGPASSWORD') ?? 'password',
        PGDATABASE: Cypress.env('PGDATABASE') ?? 'postgres',
        SEED_SCHEMA: Cypress.env('SEED_SCHEMA') ?? 'jaffle',
    };

    it('Should run dbt first', () => {
        cy.exec(
            ` dbt run --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: databaseEnvVars,
                log: true,
            },
        )
            .its('stdout')
            .should('contain', 'Completed successfully');
    });

    it('Should lightdash generate with --models', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --models orders customers`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Filtering models')
            .should('contain', 'customers')
            .should('contain', 'orders')
            .should('not.contain', 'events')
            .should('not.contain', 'users')
            .should('not.contain', 'payments')
            .should('not.contain', 'stg_customers')
            .should('not.contain', 'stg_orders')
            .should('not.contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash generate with --select', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select orders customers`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Filtering models')
            .should('contain', 'customers')
            .should('contain', 'orders')
            .should('not.contain', 'events')
            .should('not.contain', 'users')
            .should('not.contain', 'payments')
            .should('not.contain', 'stg_customers')
            .should('not.contain', 'stg_orders')
            .should('not.contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash generate with --select with + prefix', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select +orders`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Filtering models')
            .should('not.contain', 'customers')
            .should('contain', 'orders')
            .should('not.contain', 'events')
            .should('not.contain', 'users')
            // it's filtered out but matches with stg_payments
            // .should('not.contain', 'payments')
            .should('not.contain', 'stg_customers')
            .should('contain', 'stg_orders')
            .should('contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash generate with --select with + postfix', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select stg_orders+`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Filtering models')
            .should('contain', 'customers')
            .should('contain', 'orders')
            .should('not.contain', 'events')
            .should('not.contain', 'users')
            .should('not.contain', 'payments')
            .should('not.contain', 'stg_customers')
            .should('contain', 'stg_orders')
            .should('not.contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash generate with --exclude', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --exclude events`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Filtering models')
            .should('contain', 'customers')
            .should('contain', 'orders')
            .should('not.contain', 'events')
            .should('contain', 'users')
            .should('contain', 'payments')
            .should('contain', 'stg_customers')
            .should('contain', 'stg_orders')
            .should('contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash generate with --select and --exclude', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select +orders --exclude stg_orders stg_payments`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Filtering models')
            .should('not.contain', 'customers')
            .should('contain', 'orders')
            .should('not.contain', 'events')
            .should('not.contain', 'users')
            // it's filtered out but matches with stg_payments
            .should('not.contain', 'payments')
            .should('not.contain', 'stg_customers')
            .should('not.contain', 'stg_orders')
            .should('not.contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash generate all model', () => {
        cy.exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('not.contain', 'Filtering models')
            .should('contain', 'customers')
            .should('contain', 'orders')
            .should('contain', 'events')
            .should('contain', 'users')
            .should('contain', 'payments')
            .should('contain', 'stg_customers')
            .should('contain', 'stg_orders')
            .should('contain', 'stg_payments')
            .should('contain', 'Done 🕶');
    });

    it('Should lightdash compile', () => {
        cy.exec(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        )
            .its('stderr')
            .should('contain', 'Successfully compiled project');
    });

    it('Should throw error on lightdash compile', () => {
        cy.exec(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir} -m orders`,
            {
                failOnNonZeroExit: false,
                env: {
                    CI: true,
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                log: true,
            },
        ).then((result) => {
            expect(result.code).to.eq(1);
            expect(result.stderr).to.contain(
                'Failed to compile project. Found 2 errors',
            );
        });
    });
});

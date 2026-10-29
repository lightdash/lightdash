import {
    databaseEnvVars,
    dbtDemoStats,
    expect,
    runCli,
    test,
} from '../../../support/test';

test.describe.serial('CLI', () => {
    const projectDir = `../../examples/full-jaffle-shop-demo/dbt`;
    const profilesDir = `../../examples/full-jaffle-shop-demo/profiles`;
    const cliCommand = `lightdash`;

    // Scale timeout based on the number of models and thread count. dbt runs
    // models in parallel, so we estimate batches rather than sequential model count.
    const TIMEOUT_PER_BATCH_MS = 8000;
    const BASE_TIMEOUT_MS = 60000;
    const { modelCount, threads: dbtThreads } = dbtDemoStats();
    const batches = Math.ceil(modelCount / dbtThreads);
    const allModelsTimeout = BASE_TIMEOUT_MS + batches * TIMEOUT_PER_BATCH_MS;

    const lightdashEnv = () => ({
        CI: 'true',
        NODE_ENV: 'development',
        ...databaseEnvVars(),
    });

    test('Should run dbt first', async () => {
        test.setTimeout(allModelsTimeout + 30_000);
        const result = await runCli(
            ` dbt run --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                env: databaseEnvVars(),
                timeout: allModelsTimeout,
            },
        );
        expect(result.stdout).toContain('Completed successfully');
    });

    test('Should lightdash generate with --models', async () => {
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --models orders customers`,
            { env: lightdashEnv() },
        );
        expect(stderr).toContain('Filtering models');
        expect(stderr).toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).not.toContain('events');
        expect(stderr).not.toContain('users');
        expect(stderr).not.toContain('payments');
        expect(stderr).not.toContain('stg_customers');
        expect(stderr).not.toContain('stg_orders');
        expect(stderr).not.toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select', async () => {
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select orders customers`,
            { env: lightdashEnv() },
        );
        expect(stderr).toContain('Filtering models');
        expect(stderr).toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).not.toContain('events');
        expect(stderr).not.toContain('users');
        expect(stderr).not.toContain('payments');
        expect(stderr).not.toContain('stg_customers');
        expect(stderr).not.toContain('stg_orders');
        expect(stderr).not.toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select with + prefix', async () => {
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select +orders`,
            { env: lightdashEnv() },
        );
        expect(stderr).toContain('Filtering models');
        expect(stderr).not.toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).not.toContain('events');
        expect(stderr).not.toContain('users');
        // it's filtered out but matches with stg_payments
        // expect(stderr).not.toContain('payments');
        expect(stderr).not.toContain('stg_customers');
        expect(stderr).toContain('stg_orders');
        expect(stderr).toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select with + postfix', async () => {
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select stg_orders+`,
            { env: lightdashEnv() },
        );
        expect(stderr).toContain('Filtering models');
        expect(stderr).toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).not.toContain('events');
        expect(stderr).not.toContain('users');
        // it's filtered out but matches with customer_order_payments
        // expect(stderr).not.toContain('payments');
        expect(stderr).not.toContain('stg_customers');
        expect(stderr).toContain('stg_orders');
        expect(stderr).not.toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test.skip('Should lightdash generate with --exclude', async () => {
        // skipping because product_events is not in the seed data
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --exclude events`,
            { env: lightdashEnv() },
        );
        expect(stderr).toContain('Filtering models');
        expect(stderr).toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).not.toContain('events');
        expect(stderr).toContain('users');
        expect(stderr).toContain('payments');
        expect(stderr).toContain('stg_customers');
        expect(stderr).toContain('stg_orders');
        expect(stderr).toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select and --exclude', async () => {
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select +orders --exclude stg_orders stg_payments`,
            { env: lightdashEnv() },
        );
        expect(stderr).toContain('Filtering models');
        expect(stderr).not.toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).not.toContain('events');
        expect(stderr).not.toContain('users');
        // it's filtered out but matches with stg_payments
        expect(stderr).not.toContain('payments');
        expect(stderr).not.toContain('stg_customers');
        expect(stderr).not.toContain('stg_orders');
        expect(stderr).not.toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate all model', async () => {
        test.setTimeout(allModelsTimeout + 30_000);
        const { stderr } = await runCli(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            { env: lightdashEnv(), timeout: allModelsTimeout },
        );
        expect(stderr).not.toContain('Filtering models');
        expect(stderr).toContain('customers');
        expect(stderr).toContain('orders');
        expect(stderr).toContain('events');
        expect(stderr).toContain('users');
        expect(stderr).toContain('payments');
        expect(stderr).toContain('stg_customers');
        expect(stderr).toContain('stg_orders');
        expect(stderr).toContain('stg_payments');
        expect(stderr).toContain('Done 🕶');
    });

    test('Should lightdash compile', async () => {
        test.setTimeout(allModelsTimeout + 30_000);
        const { stderr } = await runCli(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            { env: lightdashEnv(), timeout: allModelsTimeout },
        );
        expect(stderr).toContain('Successfully compiled project');
    });

    test('Should throw error on lightdash compile', async () => {
        const result = await runCli(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir} -m orders --no-partial-compilation`,
            { env: lightdashEnv() },
        );
        expect(result.code).toBe(1);
        expect(result.stderr).toContain(
            'Failed to compile project. Found 2 errors',
        );
    });
});

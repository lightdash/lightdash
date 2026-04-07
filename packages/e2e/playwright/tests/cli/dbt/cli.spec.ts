import { spawnSync } from 'child_process';
import { expect, test } from '../../../fixtures';

const projectDir = '../../examples/full-jaffle-shop-demo/dbt';
const profilesDir = '../../examples/full-jaffle-shop-demo/profiles';
const cliCommand = 'lightdash';

// Scale timeout based on the number of models and thread count.
// dbt runs models in parallel, so we estimate batches rather than sequential model count.
const TIMEOUT_PER_BATCH_MS = 3000;
const BASE_TIMEOUT_MS = 30000;
const modelCount = Number(process.env.MODEL_COUNT) || 50;
const dbtThreads = Number(process.env.DBT_THREADS) || 4;
const batches = Math.ceil(modelCount / dbtThreads);
const allModelsTimeout = BASE_TIMEOUT_MS + batches * TIMEOUT_PER_BATCH_MS;

const databaseEnvVars: Record<string, string> = {
    PGHOST: process.env.PGHOST ?? 'localhost',
    PGPORT: process.env.PGPORT ?? '5432',
    PGUSER: process.env.PGUSER ?? 'postgres',
    PGPASSWORD: process.env.PGPASSWORD ?? 'password',
    PGDATABASE: process.env.PGDATABASE ?? 'postgres',
    SEED_SCHEMA: process.env.SEED_SCHEMA ?? 'jaffle',
};

function exec(
    command: string,
    options: { env?: Record<string, string>; timeout?: number } = {},
): { stdout: string; stderr: string; code: number } {
    const result = spawnSync(command, {
        encoding: 'utf-8',
        env: { ...process.env, ...options.env },
        timeout: options.timeout,
        shell: true,
    });
    return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        code: result.status ?? 1,
    };
}

test.describe('CLI', () => {
    test('Should run dbt first', async () => {
        test.setTimeout(allModelsTimeout);
        const result = exec(
            `dbt run --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            { env: databaseEnvVars, timeout: allModelsTimeout },
        );
        expect(result.stdout).toContain('Completed successfully');
    });

    test('Should lightdash generate with --models', async () => {
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --models orders customers`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Filtering models');
        expect(result.stderr).toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).not.toContain('events');
        expect(result.stderr).not.toContain('users');
        expect(result.stderr).not.toContain('payments');
        expect(result.stderr).not.toContain('stg_customers');
        expect(result.stderr).not.toContain('stg_orders');
        expect(result.stderr).not.toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select', async () => {
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select orders customers`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Filtering models');
        expect(result.stderr).toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).not.toContain('events');
        expect(result.stderr).not.toContain('users');
        expect(result.stderr).not.toContain('payments');
        expect(result.stderr).not.toContain('stg_customers');
        expect(result.stderr).not.toContain('stg_orders');
        expect(result.stderr).not.toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select with + prefix', async () => {
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select +orders`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Filtering models');
        expect(result.stderr).not.toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).not.toContain('events');
        expect(result.stderr).not.toContain('users');
        // it's filtered out but matches with stg_payments
        // expect(result.stderr).not.toContain('payments');
        expect(result.stderr).not.toContain('stg_customers');
        expect(result.stderr).toContain('stg_orders');
        expect(result.stderr).toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select with + postfix', async () => {
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select stg_orders+`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Filtering models');
        expect(result.stderr).toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).not.toContain('events');
        expect(result.stderr).not.toContain('users');
        // it's filtered out but matches with customer_order_payments
        // expect(result.stderr).not.toContain('payments');
        expect(result.stderr).not.toContain('stg_customers');
        expect(result.stderr).toContain('stg_orders');
        expect(result.stderr).not.toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test.skip('Should lightdash generate with --exclude', async () => {
        // skipping because product_events is not in the seed data
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --exclude events`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Filtering models');
        expect(result.stderr).toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).not.toContain('events');
        expect(result.stderr).toContain('users');
        expect(result.stderr).toContain('payments');
        expect(result.stderr).toContain('stg_customers');
        expect(result.stderr).toContain('stg_orders');
        expect(result.stderr).toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate with --select and --exclude', async () => {
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir} --select +orders --exclude stg_orders stg_payments`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.stderr).toContain('Filtering models');
        expect(result.stderr).not.toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).not.toContain('events');
        expect(result.stderr).not.toContain('users');
        // it's filtered out but matches with stg_payments
        expect(result.stderr).not.toContain('payments');
        expect(result.stderr).not.toContain('stg_customers');
        expect(result.stderr).not.toContain('stg_orders');
        expect(result.stderr).not.toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test('Should lightdash generate all model', async () => {
        test.setTimeout(allModelsTimeout);
        const result = exec(
            `${cliCommand} generate -y --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                timeout: allModelsTimeout,
            },
        );
        expect(result.stderr).not.toContain('Filtering models');
        expect(result.stderr).toContain('customers');
        expect(result.stderr).toContain('orders');
        expect(result.stderr).toContain('events');
        expect(result.stderr).toContain('users');
        expect(result.stderr).toContain('payments');
        expect(result.stderr).toContain('stg_customers');
        expect(result.stderr).toContain('stg_orders');
        expect(result.stderr).toContain('stg_payments');
        expect(result.stderr).toContain('Done 🕶');
    });

    test('Should lightdash compile', async () => {
        test.setTimeout(allModelsTimeout);
        const result = exec(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir}`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    ...databaseEnvVars,
                },
                timeout: allModelsTimeout,
            },
        );
        expect(result.stderr).toContain('Successfully compiled project');
    });

    test('Should throw error on lightdash compile', async () => {
        const result = exec(
            `${cliCommand} compile --project-dir ${projectDir} --profiles-dir ${profilesDir} -m orders`,
            {
                env: {
                    CI: 'true',
                    NODE_ENV: 'development',
                    PARTIAL_COMPILATION_ENABLED: 'false',
                    ...databaseEnvVars,
                },
            },
        );
        expect(result.code).toBe(1);
        expect(result.stderr).toContain(
            'Failed to compile project. Found 2 errors',
        );
    });
});

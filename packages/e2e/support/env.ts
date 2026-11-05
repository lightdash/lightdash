import { load as loadYaml } from 'js-yaml';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Everything here is read from the process environment; CI passes secrets directly.
export const PACKAGE_ROOT = join(__dirname, '..');
export const DEMO_DIR = join(
    PACKAGE_ROOT,
    '../../examples/full-jaffle-shop-demo',
);

export const env = (name: string): string | undefined => process.env[name];

export const databaseEnvVars = () => ({
    PGHOST: env('PGHOST') ?? 'localhost',
    PGPORT: env('PGPORT') ?? '5432',
    PGUSER: env('PGUSER') ?? 'postgres',
    PGPASSWORD: env('PGPASSWORD') ?? 'password',
    PGDATABASE: env('PGDATABASE') ?? 'postgres',
    SEED_SCHEMA: env('SEED_SCHEMA') ?? 'jaffle',
});

const countSqlFiles = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce(
        (count, entry) =>
            entry.isDirectory()
                ? count + countSqlFiles(join(dir, entry.name))
                : count + (entry.name.endsWith('.sql') ? 1 : 0),
        0,
    );

// dbt model count and thread count, so CLI tests can scale timeouts with parallelism.
export const dbtDemoStats = () => {
    const modelCount = countSqlFiles(join(DEMO_DIR, 'dbt/models'));
    const profiles = loadYaml(
        readFileSync(join(DEMO_DIR, 'profiles/profiles.yml'), 'utf8'),
    ) as {
        jaffle_shop?: {
            target?: string;
            outputs?: Record<string, { threads?: number }>;
        };
    };
    const targetName = profiles?.jaffle_shop?.target ?? 'jaffle';
    const threads = profiles?.jaffle_shop?.outputs?.[targetName]?.threads ?? 4;
    return { modelCount, threads };
};

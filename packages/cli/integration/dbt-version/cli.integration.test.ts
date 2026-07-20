import execa from 'execa';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../../..');
const CLI_ENTRYPOINT = path.join(REPOSITORY_ROOT, 'packages/cli/dist/index.js');
const SOURCE_PROJECT_DIR = path.join(
    REPOSITORY_ROOT,
    'examples/full-jaffle-shop-demo/dbt',
);
const SOURCE_PROFILES_DIR = path.join(
    REPOSITORY_ROOT,
    'examples/full-jaffle-shop-demo/profiles',
);
const DBT_SCHEMA_PREFIX = 'jaffle_dbt_node_';
const FULL_PROJECT_TIMEOUT_MS = 188_000;
const SELECTED_PROJECT_TIMEOUT_MS = 120_000;
const CLEANUP_TIMEOUT_MS = 30_000;
const DROP_SCHEMA_MACRO = `{% macro lightdash_drop_integration_schema(schema_name) %}
    {% set relation = api.Relation.create(database=target.database, schema=schema_name) %}
    {% do adapter.drop_schema(relation) %}
{% endmacro %}
`;

const getSeedSchema = () => {
    const schema =
        process.env.SEED_SCHEMA ??
        `${DBT_SCHEMA_PREFIX}${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    if (!/^jaffle_dbt_node_[a-z0-9_]+$/.test(schema) || schema.length > 63) {
        throw new Error(
            `SEED_SCHEMA must start with ${DBT_SCHEMA_PREFIX}, contain only lower-case letters, numbers, and underscores, and be at most 63 characters`,
        );
    }

    return schema;
};

const createSuiteRoot = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lightdash-cli-dbt-'));
    const suiteRoot = {
        root,
        home: path.join(root, 'home'),
        cwd: path.join(root, 'cwd'),
        project: path.join(root, 'project'),
        profiles: path.join(root, 'profiles'),
        target: path.join(root, 'target'),
        logs: path.join(root, 'logs'),
    };
    const generatedSourceRoots = ['target', 'logs', 'dbt_modules'].map(
        (directory) => path.join(SOURCE_PROJECT_DIR, directory),
    );

    try {
        await fs.mkdir(suiteRoot.home);
        await fs.mkdir(suiteRoot.cwd);
        await fs.mkdir(suiteRoot.target);
        await fs.mkdir(suiteRoot.logs);
        await fs.cp(SOURCE_PROJECT_DIR, suiteRoot.project, {
            recursive: true,
            filter: (source) =>
                !generatedSourceRoots.some(
                    (generatedRoot) =>
                        source === generatedRoot ||
                        source.startsWith(`${generatedRoot}${path.sep}`),
                ),
        });
        await fs.cp(SOURCE_PROFILES_DIR, suiteRoot.profiles, {
            recursive: true,
        });
        await fs.writeFile(
            path.join(
                suiteRoot.project,
                'macros/lightdash_integration_cleanup.sql',
            ),
            DROP_SCHEMA_MACRO,
        );
        return suiteRoot;
    } catch (error) {
        await fs.rm(root, { recursive: true, force: true });
        throw error;
    }
};

const createProcessEnv = (
    suiteRoot: Awaited<ReturnType<typeof createSuiteRoot>>,
    seedSchema: string,
    overrides: NodeJS.ProcessEnv = {},
) => ({
    ...process.env,
    HOME: suiteRoot.home,
    CI: 'true',
    NODE_ENV: 'development',
    FORCE_COLOR: '0',
    DBT_TARGET_PATH: suiteRoot.target,
    DBT_LOG_PATH: suiteRoot.logs,
    PGHOST: process.env.PGHOST ?? 'localhost',
    PGPORT: process.env.PGPORT ?? '5432',
    PGUSER: process.env.PGUSER ?? 'postgres',
    PGPASSWORD: process.env.PGPASSWORD ?? 'password',
    PGDATABASE: process.env.PGDATABASE ?? 'postgres',
    SEED_SCHEMA: seedSchema,
    ...overrides,
});

const runProcess = async ({
    file,
    args,
    cwd,
    env,
    timeout,
}: {
    file: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
}) => {
    const result = await execa(file, args, {
        cwd,
        env,
        timeout,
        reject: false,
    });

    return {
        command: result.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
    };
};

type ProcessResult = Awaited<ReturnType<typeof runProcess>>;
type SuiteRoot = Awaited<ReturnType<typeof createSuiteRoot>>;

const formatProcessResult = (result: ProcessResult) =>
    [
        `Command: ${result.command}`,
        `Exit code: ${result.exitCode}`,
        `Timed out: ${result.timedOut}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
    ].join('\n');

const expectProcessSuccess = (result: ProcessResult) => {
    if (result.timedOut || result.exitCode !== 0) {
        throw new Error(
            `Expected process to succeed\n${formatProcessResult(result)}`,
        );
    }
};

const normalizeOutput = (output: string) =>
    stripVTControlCharacters(output).replaceAll('\r', '');

const expectOutputToContain = (
    result: ProcessResult,
    output: string,
    expected: string,
) => {
    if (!normalizeOutput(output).includes(expected)) {
        throw new Error(
            `Expected output to contain ${JSON.stringify(expected)}\n${formatProcessResult(result)}`,
        );
    }
};

const getGeneratedModels = (output: string) =>
    new Set(
        normalizeOutput(output)
            .split('\n')
            .map((line) => line.match(/\b([A-Za-z0-9_]+)\s+➡️/)?.[1])
            .filter(
                (modelName): modelName is string => modelName !== undefined,
            ),
    );

const expectGenerateResult = (
    result: ProcessResult,
    expected: {
        included: string[];
        excluded: string[];
        filtering: boolean;
    },
) => {
    expectProcessSuccess(result);
    const stderr = normalizeOutput(result.stderr);
    const generatedModels = getGeneratedModels(stderr);
    const message = formatProcessResult(result);

    if (expected.filtering !== stderr.includes('Filtering models')) {
        throw new Error(`Unexpected Filtering models status\n${message}`);
    }
    expectOutputToContain(result, stderr, 'Done 🕶');

    expected.included.forEach((modelName) => {
        if (!generatedModels.has(modelName)) {
            throw new Error(
                `Expected generated model ${modelName}\n${message}`,
            );
        }
    });
    expected.excluded.forEach((modelName) => {
        if (generatedModels.has(modelName)) {
            throw new Error(
                `Did not expect generated model ${modelName}\n${message}`,
            );
        }
    });
};

const getSuiteRoot = (suiteRoot: SuiteRoot | null) => {
    if (suiteRoot === null) {
        throw new Error('CLI dbt integration suite root is not initialized');
    }
    return suiteRoot;
};

const getSchema = (seedSchema: string | null) => {
    if (seedSchema === null) {
        throw new Error('CLI dbt integration schema is not initialized');
    }
    return seedSchema;
};

const dbtArgs = (
    suiteRoot: SuiteRoot,
    command: string,
    args: string[] = [],
) => [
    command,
    '--project-dir',
    suiteRoot.project,
    '--profiles-dir',
    suiteRoot.profiles,
    ...args,
];

const cliArgs = (
    suiteRoot: SuiteRoot,
    command: string,
    args: string[] = [],
) => [
    CLI_ENTRYPOINT,
    command,
    '--project-dir',
    suiteRoot.project,
    '--profiles-dir',
    suiteRoot.profiles,
    '--target-path',
    suiteRoot.target,
    ...args,
];

describe.sequential('CLI dbt versions', () => {
    let suiteRoot: SuiteRoot | null = null;
    let seedSchema: string | null = null;

    const runDbt = (command: string, args: string[], timeout: number) => {
        const root = getSuiteRoot(suiteRoot);
        return runProcess({
            file: 'dbt',
            args: dbtArgs(root, command, args),
            cwd: root.cwd,
            env: createProcessEnv(root, getSchema(seedSchema)),
            timeout,
        });
    };

    const runCli = (
        command: string,
        args: string[],
        timeout: number,
        envOverrides: NodeJS.ProcessEnv = {},
    ) => {
        const root = getSuiteRoot(suiteRoot);
        return runProcess({
            file: process.execPath,
            args: cliArgs(root, command, args),
            cwd: root.cwd,
            env: createProcessEnv(root, getSchema(seedSchema), envOverrides),
            timeout,
        });
    };

    beforeAll(async () => {
        seedSchema = getSeedSchema();
        suiteRoot = await createSuiteRoot();
        const seedResult = await runDbt(
            'seed',
            ['--full-refresh'],
            FULL_PROJECT_TIMEOUT_MS,
        );
        expectProcessSuccess(seedResult);
    });

    afterAll(async () => {
        const root = suiteRoot;
        const schema = seedSchema;
        if (root === null || schema === null) {
            return;
        }

        try {
            const dropResult = await runProcess({
                file: 'dbt',
                args: dbtArgs(root, 'run-operation', [
                    'lightdash_drop_integration_schema',
                    '--args',
                    JSON.stringify({ schema_name: schema }),
                ]),
                cwd: root.cwd,
                env: createProcessEnv(root, schema),
                timeout: CLEANUP_TIMEOUT_MS,
            });
            expectProcessSuccess(dropResult);
        } finally {
            await fs.rm(root.root, { recursive: true, force: true });
        }
    });

    it('Should run dbt first', async () => {
        const result = await runDbt('run', [], FULL_PROJECT_TIMEOUT_MS);

        expectProcessSuccess(result);
        expectOutputToContain(result, result.stdout, 'Completed successfully');
    });

    it('Should lightdash generate with --models', async () => {
        const result = await runCli(
            'generate',
            ['-y', '--models', 'orders', 'customers'],
            SELECTED_PROJECT_TIMEOUT_MS,
        );

        expectGenerateResult(result, {
            included: ['customers', 'orders'],
            excluded: [
                'events',
                'users',
                'payments',
                'stg_customers',
                'stg_orders',
                'stg_payments',
            ],
            filtering: true,
        });
    });

    it('Should lightdash generate with --select', async () => {
        const result = await runCli(
            'generate',
            ['-y', '--select', 'orders', 'customers'],
            SELECTED_PROJECT_TIMEOUT_MS,
        );

        expectGenerateResult(result, {
            included: ['customers', 'orders'],
            excluded: [
                'events',
                'users',
                'payments',
                'stg_customers',
                'stg_orders',
                'stg_payments',
            ],
            filtering: true,
        });
    });

    it('Should lightdash generate with --select with + prefix', async () => {
        const result = await runCli(
            'generate',
            ['-y', '--select', '+orders'],
            SELECTED_PROJECT_TIMEOUT_MS,
        );

        expectGenerateResult(result, {
            included: ['orders', 'stg_orders', 'stg_payments'],
            excluded: [
                'customers',
                'events',
                'users',
                'payments',
                'stg_customers',
            ],
            filtering: true,
        });
    });

    it('Should lightdash generate with --select with + postfix', async () => {
        const result = await runCli(
            'generate',
            ['-y', '--select', 'stg_orders+'],
            SELECTED_PROJECT_TIMEOUT_MS,
        );

        expectGenerateResult(result, {
            included: ['customers', 'orders', 'stg_orders'],
            excluded: [
                'events',
                'users',
                'payments',
                'stg_customers',
                'stg_payments',
            ],
            filtering: true,
        });
    });

    it('Should lightdash generate with --select and --exclude', async () => {
        const result = await runCli(
            'generate',
            [
                '-y',
                '--select',
                '+orders',
                '--exclude',
                'stg_orders',
                'stg_payments',
            ],
            SELECTED_PROJECT_TIMEOUT_MS,
        );

        expectGenerateResult(result, {
            included: ['orders'],
            excluded: [
                'customers',
                'events',
                'users',
                'payments',
                'stg_customers',
                'stg_orders',
                'stg_payments',
            ],
            filtering: true,
        });
    });

    it('Should lightdash generate all model', async () => {
        const result = await runCli(
            'generate',
            ['-y'],
            FULL_PROJECT_TIMEOUT_MS,
        );

        expectGenerateResult(result, {
            included: [
                'customers',
                'orders',
                'events',
                'users',
                'payments',
                'stg_customers',
                'stg_orders',
                'stg_payments',
            ],
            excluded: [],
            filtering: false,
        });
    });

    it('Should lightdash compile', async () => {
        const result = await runCli('compile', [], FULL_PROJECT_TIMEOUT_MS);

        expectProcessSuccess(result);
        expectOutputToContain(
            result,
            result.stderr,
            'Successfully compiled project',
        );
    });

    it('Should throw error on lightdash compile', async () => {
        const result = await runCli(
            'compile',
            ['-m', 'orders'],
            SELECTED_PROJECT_TIMEOUT_MS,
            { PARTIAL_COMPILATION_ENABLED: 'false' },
        );
        if (result.timedOut || result.exitCode !== 1) {
            throw new Error(
                `Expected compile process to exit with code 1\n${formatProcessResult(result)}`,
            );
        }
        expectOutputToContain(
            result,
            result.stderr,
            'Failed to compile project. Found 2 errors',
        );
    });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

const include = ['src/**/*.test.ts', 'eslint-rules/**/*.test.ts'];
const exclude = [
    '**/node_modules/**',
    '**/dist/**',
    'src/**/*.integration.test.ts',
    'src/ee/services/McpService/mcp-chart-app/**',
];

// Files that replace modules or change process-wide state get a fresh module graph per file.
const needsIsolation =
    /\bvi\.(mock|doMock|hoisted|resetModules|stubGlobal|stubEnv|unstubAllGlobals|unstubAllEnvs|useFakeTimers|setSystemTime)\(|testing\/fetchMock|process\.env(\.\w+|\[[^\]]+\])\s*=[^=]|delete process\.env|Object\.assign\(process\.env/;

// Files the pattern misses that still fail when they share a module graph with other files.
const alwaysIsolated = [
    'src/dbt/dbtPartialParseBaseline.test.ts',
    'src/ee/models/AiAgentDocumentModel.test.ts',
    'src/ee/postgresWire/PostgresWireServer.test.ts',
    'src/models/OrganizationModel.test.ts',
    'src/nats/natsConfig.test.ts',
];

const isolatedFiles = fs
    .globSync(include, { cwd: __dirname, exclude })
    .map((file) => file.split(path.sep).join('/'))
    .filter(
        (file) =>
            alwaysIsolated.includes(file) ||
            needsIsolation.test(
                fs.readFileSync(path.resolve(__dirname, file), 'utf8'),
            ),
    );

const resolve = {
    alias: {
        '@': path.resolve(__dirname, './src'),
        '@lightdash/common/src': path.resolve(__dirname, '../common/src'),
        '@lightdash/common': path.resolve(__dirname, '../common/src'),
        '@lightdash/formula': path.resolve(__dirname, '../formula/src'),
        '@lightdash/warehouses': path.resolve(__dirname, '../warehouses/src'),
    },
};

const shared = {
    environment: 'node',
    globals: true,
    setupFiles: ['./setupVitest.ts'],
    env: {
        TZ: 'UTC',
        LANG: 'en_US.UTF-8',
        NODE_ENV: 'test',
    },
};

export default defineConfig({
    test: {
        maxWorkers: '50%',
        projects: [
            {
                resolve,
                test: {
                    ...shared,
                    name: 'backend-unit-tests',
                    include,
                    exclude: [...exclude, ...isolatedFiles],
                    isolate: false,
                },
            },
            {
                resolve,
                test: {
                    ...shared,
                    name: 'backend-unit-tests-isolated',
                    include: isolatedFiles,
                    exclude,
                },
            },
        ],
    },
});

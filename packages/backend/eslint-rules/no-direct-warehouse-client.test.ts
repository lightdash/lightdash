import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(path.join(tmpdir(), 'warehouse-client-rule-'));
const configPath = path.join(directory, 'oxlintrc.json');
const binaryPath = path.join(__dirname, '../node_modules/.bin/oxlint');

writeFileSync(
    configPath,
    JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [
            {
                name: 'lightdash',
                specifier: path.join(__dirname, 'eslint-plugin-lightdash.cjs'),
            },
        ],
        rules: { 'lightdash/no-direct-warehouse-client': 'error' },
    }),
);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

type LintOutput = {
    diagnostics: {
        code: string;
        labels: { span: { line: number } }[];
    }[];
    number_of_files: number;
};

const reportedLines = (source: string[]) => {
    const fixturePath = path.join(directory, 'fixture.ts');
    writeFileSync(fixturePath, source.join('\n'));
    const result = spawnSync(
        binaryPath,
        ['--config', configPath, '--format', 'json', fixturePath],
        { cwd: directory, encoding: 'utf8', timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe('');
    let output: LintOutput;
    try {
        output = JSON.parse(result.stdout) as LintOutput;
    } catch (error) {
        throw new Error(`Invalid oxlint output: ${result.stdout}`, {
            cause: error,
        });
    }
    expect(output.number_of_files).toBe(1);
    expect(result.status).toBe(output.diagnostics.length > 0 ? 1 : 0);
    for (const diagnostic of output.diagnostics) {
        expect(diagnostic.code).toContain('no-direct-warehouse-client');
    }
    return output.diagnostics
        .map((diagnostic) => diagnostic.labels[0].span.line)
        .sort((left, right) => left - right);
};

describe('no-direct-warehouse-client in oxlint', () => {
    it('reports the four alias and namespace review cases', () => {
        expect(
            reportedLines([
                "import { PostgresWarehouseClient as PgClient, warehouseClientFromCredentials as wcf } from '@lightdash/warehouses';",
                "import * as warehouses from '@lightdash/warehouses';",
                'new PgClient();',
                'new warehouses.PostgresWarehouseClient();',
                'warehouses.warehouseClientFromCredentials();',
                'wcf();',
            ]),
        ).toEqual([3, 4, 5, 6]);
    });

    it('reports aliased and namespace SSH tunnels and computed members', () => {
        expect(
            reportedLines([
                "import { SshTunnel as Tunnel } from '@lightdash/warehouses';",
                "import * as ns from '@lightdash/warehouses';",
                'new Tunnel();',
                'new ns.SshTunnel();',
                "new ns['PostgresWarehouseClient']();",
                "ns['warehouseClientFromCredentials']();",
            ]),
        ).toEqual([3, 4, 5, 6]);
    });

    it.each(['@lightdash/warehouses', '@lightdash/warehouses/dist/index'])(
        'reports named and default namespace imports from %s',
        (source) => {
            expect(
                reportedLines([
                    `import ns, { PostgresWarehouseClient as PgClient } from '${source}';`,
                    'new PgClient();',
                    'new ns.PostgresWarehouseClient();',
                    'ns.warehouseClientFromCredentials();',
                ]),
            ).toEqual([2, 3, 4]);
        },
    );

    it.each([
        "require('@lightdash/warehouses')",
        "require('@lightdash/warehouses/dist/index')",
        "await import('@lightdash/warehouses')",
        "await import('@lightdash/warehouses/dist/index')",
    ])('reports destructured and namespace bindings from %s', (initializer) => {
        expect(
            reportedLines([
                `const { PostgresWarehouseClient: PgClient, warehouseClientFromCredentials: wcf, SshTunnel: Tunnel } = ${initializer};`,
                `const ns = ${initializer};`,
                'new PgClient();',
                'wcf();',
                'new Tunnel();',
                'new ns.PostgresWarehouseClient();',
                "ns['warehouseClientFromCredentials']();",
            ]),
        ).toEqual([3, 4, 5, 6, 7]);
    });

    it('keeps bare factories and model helper calls restricted', () => {
        expect(
            reportedLines([
                'warehouseClientFromCredentials();',
                'anything.getWarehouseClientFromCredentials();',
                "anything['getWarehouseClientFromCredentials']();",
            ]),
        ).toEqual([1, 2, 3]);
    });

    it('keeps every bare constructor restricted without imports', () => {
        expect(
            reportedLines([
                'new SshTunnel();',
                'new ListedDatabasesPostgresWarehouseClient();',
                'new SnowflakeWarehouseClient();',
                'new PostgresWarehouseClient();',
                'new RedshiftWarehouseClient();',
                'new BigqueryWarehouseClient();',
                'new DatabricksWarehouseClient();',
                'new TrinoWarehouseClient();',
                'new ClickhouseWarehouseClient();',
                'new AthenaWarehouseClient();',
            ]),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('still reports a banned bare name imported from another package', () => {
        expect(
            reportedLines([
                "import { PostgresWarehouseClient } from './local';",
                'new PostgresWarehouseClient();',
            ]),
        ).toEqual([2]);
    });

    it('allows DuckDB, analytics clients and SQL builders', () => {
        expect(
            reportedLines([
                "import { DuckdbWarehouseClient, DuckdbWarehouseClient as Duck, createAnalyticsClient, warehouseSqlBuilderFromType } from '@lightdash/warehouses';",
                "import * as ns from '@lightdash/warehouses';",
                'new DuckdbWarehouseClient();',
                'new Duck();',
                'new ns.DuckdbWarehouseClient();',
                'createAnalyticsClient();',
                'ns.createAnalyticsClient();',
                'warehouseSqlBuilderFromType();',
                'ns.warehouseSqlBuilderFromType();',
            ]),
        ).toEqual([]);
    });

    it('allows unrelated locals and aliases or namespaces from other packages', () => {
        expect(
            reportedLines([
                'class PgClient {}',
                'new PgClient();',
                "import { PostgresWarehouseClient as OtherClient } from './local';",
                "import * as ns from '@lightdash/warehouses-other';",
                'new OtherClient();',
                'new ns.PostgresWarehouseClient();',
                'ns.warehouseClientFromCredentials();',
            ]),
        ).toEqual([]);
    });

    it('respects shadowed imports and resolves imports declared after usage', () => {
        expect(
            reportedLines([
                'new PgClient();',
                "import { PostgresWarehouseClient as PgClient, warehouseClientFromCredentials as wcf } from '@lightdash/warehouses';",
                "import * as ns from '@lightdash/warehouses';",
                'function local(PgClient, wcf, ns) {',
                'new PgClient(); wcf(); new ns.PostgresWarehouseClient();',
                '}',
                'function imported() { new PgClient(); wcf(); }',
            ]),
        ).toEqual([1, 7, 7]);
    });

    it('keeps CommonJS and dynamic import bindings in their own scopes', () => {
        expect(
            reportedLines([
                'async function imported() {',
                "const { PostgresWarehouseClient: PgClient } = require('@lightdash/warehouses');",
                "const ns = await import('@lightdash/warehouses');",
                'new PgClient();',
                'new ns.PostgresWarehouseClient();',
                '}',
                'function local(PgClient, ns) {',
                'new PgClient(); new ns.PostgresWarehouseClient();',
                '}',
            ]),
        ).toEqual([4, 5]);
    });

    it('allows shadowed require, unrelated modules and nonliteral member keys', () => {
        expect(
            reportedLines([
                'function local(require) {',
                "const { PostgresWarehouseClient: PgClient } = require('@lightdash/warehouses');",
                'new PgClient();',
                '}',
                "const other = require('./local');",
                'new other.PostgresWarehouseClient();',
                "const dynamic = await import('@lightdash/warehouses-other');",
                'dynamic.warehouseClientFromCredentials();',
                "import * as ns from '@lightdash/warehouses';",
                'new ns[PostgresWarehouseClient]();',
            ]),
        ).toEqual([]);
    });
});

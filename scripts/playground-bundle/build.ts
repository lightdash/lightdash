import { DimensionType, SupportedDbtVersions } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    cp,
    mkdtemp,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { DbtLocalProjectAdapter } from '../../packages/backend/src/projectAdapters/dbtLocalProjectAdapter';

type DuckDbConnection = {
    closeSync(): void;
    run(
        sql: string,
    ): Promise<{ getRowObjects(): Promise<Record<string, unknown>[]> }>;
};

const root = path.resolve(__dirname, '../..');
const sourceDbtProjectDir = path.join(
    root,
    'examples/full-jaffle-shop-demo/dbt',
);
const seedDir = path.join(sourceDbtProjectDir, 'data');
const outputDir = path.join(root, 'packages/backend/assets/playground');
const databasePath = path.join(outputDir, 'jaffle_shop.duckdb');
const exploresPath = path.join(outputDir, 'explores.json');
const checksumsPath = path.join(outputDir, 'SHA256SUMS');
const venvBin = path.join(__dirname, '.venv/bin');
const execFileAsync = promisify(execFile);
const maxSeedRows = 5_000;

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const loadDuckDb = async () => {
    const requireFromWarehouses = createRequire(
        path.join(root, 'packages/warehouses/package.json'),
    );
    const modulePath = requireFromWarehouses.resolve('@duckdb/node-api');
    return import(pathToFileURL(modulePath).href) as Promise<{
        DuckDBInstance: {
            create(
                database: string,
                options?: Record<string, string>,
            ): Promise<{
                connect(): Promise<DuckDbConnection>;
                closeSync(): void;
            }>;
        };
    }>;
};

const withDatabase = async <T>(
    callback: (connection: DuckDbConnection) => Promise<T>,
): Promise<T> => {
    const { DuckDBInstance } = await loadDuckDb();
    const instance = await DuckDBInstance.create(databasePath, {
        default_block_size: '16384',
    });
    const connection = await instance.connect();
    try {
        return await callback(connection);
    } finally {
        connection.closeSync();
        instance.closeSync();
    }
};

const loadSeeds = async () => {
    await rm(databasePath, { force: true });
    const csvFiles = (await readdir(seedDir, { recursive: true }))
        .filter((file) => file.endsWith('.csv'))
        .sort();

    await withDatabase(async (connection) => {
        await connection.run('CREATE SCHEMA jaffle');
        for (const file of csvFiles) {
            const table = path.basename(file, '.csv');
            await connection.run(
                `CREATE TABLE jaffle.${quoteIdentifier(table)} AS ` +
                    `SELECT * FROM read_csv_auto(${quoteLiteral(path.join(seedDir, file))}, header = true) ` +
                    `LIMIT ${maxSeedRows}`,
            );
        }
    });
    return csvFiles.length;
};

const typeFromDuckDb = (type: string): DimensionType => {
    if (/BOOL/i.test(type)) return DimensionType.BOOLEAN;
    if (/TIMESTAMP|TIME/i.test(type)) return DimensionType.TIMESTAMP;
    if (/DATE/i.test(type)) return DimensionType.DATE;
    if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(type)) {
        return DimensionType.NUMBER;
    }
    return DimensionType.STRING;
};

const getCatalog = () =>
    withDatabase(async (connection) => {
        const result = await connection.run(`
            SELECT table_catalog, table_schema, table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'jaffle'
            ORDER BY table_name, ordinal_position
        `);
        const rows = await result.getRowObjects();
        const catalog: Record<
            string,
            Record<string, Record<string, Record<string, DimensionType>>>
        > = {};
        for (const row of rows) {
            const database = String(row.table_catalog);
            const schema = String(row.table_schema);
            const table = String(row.table_name);
            catalog[database] ??= {};
            catalog[database][schema] ??= {};
            catalog[database][schema][table] ??= {};
            catalog[database][schema][table][String(row.column_name)] =
                typeFromDuckDb(String(row.data_type));
        }
        return catalog;
    });

const main = async () => {
    await mkdir(outputDir, { recursive: true });
    const seedCount = await loadSeeds();
    const tempProfilesDir = await mkdtemp(
        path.join(tmpdir(), 'lightdash-playground-profiles-'),
    );
    const tempProjectRoot = await mkdtemp(
        path.join(tmpdir(), 'lightdash-playground-dbt-'),
    );
    const dbtProjectDir = path.join(tempProjectRoot, 'dbt');
    await cp(sourceDbtProjectDir, dbtProjectDir, {
        recursive: true,
        filter: (source) => !source.includes(`${path.sep}target`),
    });
    const projectFile = path.join(dbtProjectDir, 'dbt_project.yml');
    const projectYaml = await readFile(projectFile, 'utf8');
    await writeFile(
        projectFile,
        projectYaml.replace(
            '    materialized: table',
            '    materialized: view',
        ),
    );
    const profiles = `jaffle_shop:
  target: jaffle
  outputs:
    jaffle:
      type: duckdb
      path: ${JSON.stringify(databasePath)}
      schema: jaffle
      threads: 4
`;
    await writeFile(path.join(tempProfilesDir, 'profiles.yml'), profiles);

    const previousPath = process.env.PATH;
    process.env.PATH = `${venvBin}:${previousPath ?? ''}`;
    const adapter = new DbtLocalProjectAdapter({
        warehouseClient: new DuckdbWarehouseClient(),
        projectDir: dbtProjectDir,
        profilesDir: tempProfilesDir,
        target: 'jaffle',
        profileName: 'jaffle_shop',
        cachedWarehouse: {
            warehouseCatalog: undefined,
            onWarehouseCatalogChange: () => {},
        },
        dbtVersion: SupportedDbtVersions.V1_10,
    });

    try {
        try {
            const { stdout, stderr } = await execFileAsync(
                path.join(venvBin, 'dbt'),
                [
                    'run',
                    '--profiles-dir',
                    tempProfilesDir,
                    '--project-dir',
                    dbtProjectDir,
                    '--target',
                    'jaffle',
                ],
            );
            process.stdout.write(stdout);
            process.stderr.write(stderr);
        } catch (error) {
            if (error && typeof error === 'object') {
                if ('stdout' in error)
                    process.stdout.write(String(error.stdout));
                if ('stderr' in error)
                    process.stderr.write(String(error.stderr));
            }
            throw error;
        }

        adapter.cachedWarehouse.warehouseCatalog = await getCatalog();
        const explores = await adapter.compileAllExplores();
        const exploresJson = `${JSON.stringify(explores)}\n`;
        await writeFile(exploresPath, exploresJson);
        const checksums = [
            ['explores.json', Buffer.from(exploresJson)],
            ['jaffle_shop.duckdb', await readFile(databasePath)],
        ]
            .map(
                ([file, contents]) =>
                    `${createHash('sha256').update(contents).digest('hex')}  ${file}`,
            )
            .join('\n');
        await writeFile(checksumsPath, `${checksums}\n`);
        console.log(
            `Built playground bundle: ${seedCount} seeds, ${explores.length} explores`,
        );
    } finally {
        process.env.PATH = previousPath;
        await adapter.destroy();
        await rm(tempProfilesDir, { recursive: true, force: true });
        await rm(tempProjectRoot, { recursive: true, force: true });
    }
};

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});

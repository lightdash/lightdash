import {
    DimensionType,
    findFieldByIdInExplore,
    isExploreError,
    SupportedDbtVersions,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    cp,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { DbtLocalProjectAdapter } from '../../packages/backend/src/projectAdapters/dbtLocalProjectAdapter';
import { playgroundContent } from './content';

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
const contentPath = path.join(outputDir, 'content.json');
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
        await csvFiles.reduce(
            (previous, file) =>
                previous.then(() => {
                    const table = path.basename(file, '.csv');
                    return connection.run(
                        `CREATE TABLE jaffle.${quoteIdentifier(table)} AS ` +
                            `SELECT * FROM read_csv_auto(${quoteLiteral(path.join(seedDir, file))}, header = true) ` +
                            `LIMIT ${maxSeedRows}`,
                    );
                }),
            Promise.resolve(),
        );
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

const validatePlaygroundContent = (
    explores: (Explore | ExploreError)[],
): void => {
    const chartKeys = new Set<string>();

    for (const chart of playgroundContent.charts) {
        if (chartKeys.has(chart.key)) {
            throw new Error(`Duplicate playground chart key: ${chart.key}`);
        }
        chartKeys.add(chart.key);

        const explore = explores.find(
            ({ name }) => name === chart.metricQuery.exploreName,
        );
        if (!explore || isExploreError(explore)) {
            throw new Error(
                `Playground chart ${chart.key} references an unavailable explore: ${chart.metricQuery.exploreName}`,
            );
        }

        const fieldIds = [
            ...chart.metricQuery.dimensions,
            ...chart.metricQuery.metrics,
            ...chart.metricQuery.sorts.map(({ fieldId }) => fieldId),
        ];
        for (const fieldId of fieldIds) {
            const field = findFieldByIdInExplore(explore, fieldId);
            if (!field) {
                throw new Error(
                    `Playground chart ${chart.key} references an unavailable field: ${fieldId}`,
                );
            }
            if (
                field.requiredAttributes ||
                field.anyAttributes ||
                field.tablesRequiredAttributes
            ) {
                throw new Error(
                    `Playground chart ${chart.key} references a restricted field: ${fieldId}`,
                );
            }
        }
    }

    for (const tile of playgroundContent.dashboard.tiles) {
        if (
            tile.type === 'saved_chart' &&
            !chartKeys.has(tile.properties.chartKey)
        ) {
            throw new Error(
                `Playground dashboard references an unavailable chart: ${tile.properties.chartKey}`,
            );
        }
    }
};

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
        environmentVariableAllowlist: [],
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
        validatePlaygroundContent(explores);
        const exploresJson = `${JSON.stringify(explores)}\n`;
        const contentJson = `${JSON.stringify(playgroundContent)}\n`;
        await writeFile(exploresPath, exploresJson);
        await writeFile(contentPath, contentJson);
        const checksums = [
            ['explores.json', Buffer.from(exploresJson)],
            ['content.json', Buffer.from(contentJson)],
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

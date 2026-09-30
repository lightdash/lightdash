import {
    findFieldByIdInExplore,
    isExploreError,
    SupportedDbtVersions,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    EMBEDDED_BUNDLE_CHECKSUMS_FILE,
    EMBEDDED_BUNDLE_PREVIOUS_DIRECTORY,
    getEmbeddedBundleVersion,
    parseEmbeddedBundleChecksums,
} from '@lightdash/warehouses';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rename,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { DbtLocalProjectAdapter } from '../../packages/backend/src/projectAdapters/dbtLocalProjectAdapter';
import { prepareDbtProjectCopy, writeLearnBundle } from './build-learn';
import { getCatalog, getDatabaseFingerprint, withDatabase } from './compile';
import { playgroundContent } from './content';

const root = path.resolve(__dirname, '../..');
const sourceDbtProjectDir = path.join(
    root,
    'examples/full-jaffle-shop-demo/dbt',
);
const seedDir = path.join(sourceDbtProjectDir, 'data');
const outputRelativeDir = 'packages/backend/assets/playground';
const outputDir = path.join(root, outputRelativeDir);
const previousDir = path.join(outputDir, EMBEDDED_BUNDLE_PREVIOUS_DIRECTORY);
const dataset = 'jaffle_shop';
const databaseFile = `${dataset}.duckdb`;
const exploresFile = 'explores.json';
const contentFile = 'content.json';
const baseRef = process.env.PLAYGROUND_BUNDLE_BASE_REF ?? 'origin/main';
const venvBin = path.join(__dirname, '.venv/bin');
const execFileAsync = promisify(execFile);
const maxSeedRows = 5_000;

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sha256 = (contents: Buffer | string) =>
    createHash('sha256').update(contents).digest('hex');

const loadSeeds = async (databasePath: string) => {
    const csvFiles = (await readdir(seedDir, { recursive: true }))
        .filter((file) => file.endsWith('.csv'))
        .sort();

    await withDatabase(databasePath, async (connection) => {
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

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const stableId = (seed: string) => {
    const hex = sha256(seed);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

type LineageGraph = Record<string, { type: string; name: string }[]>;

/** dbt lists lineage in parse order, which differs between machines. */
const sortLineageGraph = (graph: LineageGraph): LineageGraph =>
    Object.fromEntries(
        Object.entries(graph)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, nodes]) => [
                name,
                [...nodes].sort((a, b) =>
                    `${a.type}.${a.name}`.localeCompare(`${b.type}.${b.name}`),
                ),
            ]),
    );

/**
 * The compiler gives filters random ids. Each one is replaced by an id
 * derived from where it first appears, so rebuilds are stable and ids that
 * the compiler shared between explores stay shared. Lineage is sorted.
 */
const normaliseExplores = (
    explores: (Explore | ExploreError)[],
): (Explore | ExploreError)[] => {
    const replacements = new Map<string, string>();
    const replaceIds = (value: unknown, location: string): unknown => {
        if (Array.isArray(value)) {
            return value.map((item, index) =>
                replaceIds(item, `${location}[${index}]`),
            );
        }
        if (value === null || typeof value !== 'object') return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => {
                if (
                    key === 'id' &&
                    typeof item === 'string' &&
                    UUID_PATTERN.test(item)
                ) {
                    if (!replacements.has(item)) {
                        replacements.set(item, stableId(`${location}.id`));
                    }
                    return [key, replacements.get(item)];
                }
                if (key === 'lineageGraph' && item !== null) {
                    return [key, sortLineageGraph(item as LineageGraph)];
                }
                return [key, replaceIds(item, `${location}.${key}`)];
            }),
        );
    };
    return [...explores]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
            (explore) =>
                replaceIds(explore, explore.name) as Explore | ExploreError,
        );
};

const readFromBaseRef = async (
    relativePath: string,
): Promise<Buffer | null> => {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['show', `${baseRef}:${relativePath}`],
            { cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
        );
        return stdout;
    } catch {
        return null;
    }
};

const assertBaseRefExists = async () => {
    try {
        await execFileAsync('git', ['rev-parse', '--verify', baseRef], {
            cwd: root,
        });
    } catch {
        throw new Error(
            `Cannot read the base bundle from ${baseRef}. Fetch it, or set PLAYGROUND_BUNDLE_BASE_REF to the ref the release is cut from.`,
        );
    }
};

/**
 * Pods from the previous release keep serving during a rolling deploy, so
 * the image retains the bundle that the base ref ships. When the new build
 * does not change the version, the base ref's retained bundle carries over.
 */
const stagePreviousBundle = async (
    stagingPreviousDir: string,
    newChecksums: ReadonlyMap<string, string>,
): Promise<string | null> => {
    const baseChecksumsText = await readFromBaseRef(
        `${outputRelativeDir}/${EMBEDDED_BUNDLE_CHECKSUMS_FILE}`,
    );
    if (baseChecksumsText === null) return null;
    const baseChecksums = parseEmbeddedBundleChecksums(
        baseChecksumsText.toString('utf8'),
    );
    const sameVersion =
        getEmbeddedBundleVersion(baseChecksums, dataset) ===
        getEmbeddedBundleVersion(newChecksums, dataset);
    const sourceDir = sameVersion
        ? `${outputRelativeDir}/${EMBEDDED_BUNDLE_PREVIOUS_DIRECTORY}`
        : outputRelativeDir;
    const previousChecksumsText = sameVersion
        ? await readFromBaseRef(
              `${sourceDir}/${EMBEDDED_BUNDLE_CHECKSUMS_FILE}`,
          )
        : baseChecksumsText;
    if (previousChecksumsText === null) return null;
    const previousChecksums = parseEmbeddedBundleChecksums(
        previousChecksumsText.toString('utf8'),
    );

    await mkdir(stagingPreviousDir, { recursive: true });
    await writeFile(
        path.join(stagingPreviousDir, EMBEDDED_BUNDLE_CHECKSUMS_FILE),
        previousChecksumsText,
    );
    if (
        previousChecksums.get(databaseFile) !== newChecksums.get(databaseFile)
    ) {
        const database = await readFromBaseRef(`${sourceDir}/${databaseFile}`);
        if (database === null) {
            throw new Error(
                `${baseRef} lists ${sourceDir}/${databaseFile} but does not contain it`,
            );
        }
        await writeFile(path.join(stagingPreviousDir, databaseFile), database);
    }
    return getEmbeddedBundleVersion(previousChecksums, dataset);
};

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
        const brokenFields = new Set(chart.brokenFields ?? []);
        for (const fieldId of brokenFields) {
            if (findFieldByIdInExplore(explore, fieldId)) {
                throw new Error(
                    `Playground chart ${chart.key} lists ${fieldId} as broken, but the explore has it`,
                );
            }
        }
        for (const fieldId of fieldIds) {
            if (brokenFields.has(fieldId)) continue;
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
    await assertBaseRefExists();
    await mkdir(outputDir, { recursive: true });
    const stagingDir = await mkdtemp(path.join(outputDir, '.staging-'));
    const stagedDatabasePath = path.join(stagingDir, databaseFile);
    const seedCount = await loadSeeds(stagedDatabasePath);
    const tempProfilesDir = await mkdtemp(
        path.join(tmpdir(), 'lightdash-playground-profiles-'),
    );
    const tempProjectRoot = await mkdtemp(
        path.join(tmpdir(), 'lightdash-playground-dbt-'),
    );
    const dbtProjectDir = path.join(tempProjectRoot, 'dbt');
    await prepareDbtProjectCopy(sourceDbtProjectDir, dbtProjectDir);
    const learnFileCount = await writeLearnBundle(dbtProjectDir);
    const profiles = `jaffle_shop:
  target: jaffle
  outputs:
    jaffle:
      type: duckdb
      path: ${JSON.stringify(stagedDatabasePath)}
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
        partialParseBaselinePath: null,
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

        adapter.cachedWarehouse.warehouseCatalog =
            await getCatalog(stagedDatabasePath);
        const explores = normaliseExplores(await adapter.compileAllExplores());
        validatePlaygroundContent(explores);

        const committedDatabasePath = path.join(outputDir, databaseFile);
        const keepCommittedDatabase =
            existsSync(committedDatabasePath) &&
            (await getDatabaseFingerprint(committedDatabasePath)) ===
                (await getDatabaseFingerprint(stagedDatabasePath));
        const exploresJson = `${JSON.stringify(explores)}\n`;
        const contentJson = `${JSON.stringify(playgroundContent)}\n`;
        await writeFile(path.join(stagingDir, exploresFile), exploresJson);
        await writeFile(path.join(stagingDir, contentFile), contentJson);
        const checksums = new Map([
            [exploresFile, sha256(exploresJson)],
            [contentFile, sha256(contentJson)],
            [
                databaseFile,
                sha256(
                    await readFile(
                        keepCommittedDatabase
                            ? committedDatabasePath
                            : stagedDatabasePath,
                    ),
                ),
            ],
        ]);
        await writeFile(
            path.join(stagingDir, EMBEDDED_BUNDLE_CHECKSUMS_FILE),
            `${[...checksums]
                .map(([file, digest]) => `${digest}  ${file}`)
                .join('\n')}\n`,
        );
        const stagingPreviousDir = path.join(
            stagingDir,
            EMBEDDED_BUNDLE_PREVIOUS_DIRECTORY,
        );
        const previousVersion = await stagePreviousBundle(
            stagingPreviousDir,
            checksums,
        );

        // Each rename is atomic and SHA256SUMS moves last, so a reader never
        // sees a checksum for a payload that is not yet in place. A run that
        // stops midway leaves payloads that fail verification rather than
        // a bundle that passes it.
        if (!keepCommittedDatabase) {
            await rename(stagedDatabasePath, committedDatabasePath);
        }
        await rename(
            path.join(stagingDir, exploresFile),
            path.join(outputDir, exploresFile),
        );
        await rename(
            path.join(stagingDir, contentFile),
            path.join(outputDir, contentFile),
        );
        await rm(previousDir, { recursive: true, force: true });
        if (previousVersion !== null) {
            await rename(stagingPreviousDir, previousDir);
        }
        await rename(
            path.join(stagingDir, EMBEDDED_BUNDLE_CHECKSUMS_FILE),
            path.join(outputDir, EMBEDDED_BUNDLE_CHECKSUMS_FILE),
        );
        console.log(
            `Built playground bundle ${getEmbeddedBundleVersion(checksums, dataset)}` +
                ` (previous ${previousVersion ?? 'none'}): ${seedCount} seeds, ${explores.length} explores,` +
                ` database ${keepCommittedDatabase ? 'unchanged' : 'replaced'}, learn bundle ${learnFileCount} files`,
        );
    } finally {
        process.env.PATH = previousPath;
        await adapter.destroy();
        await rm(stagingDir, { recursive: true, force: true });
        await rm(tempProfilesDir, { recursive: true, force: true });
        await rm(tempProjectRoot, { recursive: true, force: true });
    }
};

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});

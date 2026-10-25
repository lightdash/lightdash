import * as fs from 'fs';
import * as path from 'path';

type Source = { name: string; uuid: string | null; manifestPath: string };
type ExploreRow = {
    source: string;
    name: string;
    error: boolean;
    errors: { type: string; message: string }[];
    dbtModelIdentity: { sourceUuid: string | null; uniqueId: string } | null;
    attributedSourceUuid: string | null;
};

const root = process.env.LAST_GOOD_PRODUCT_ROOT ?? process.cwd();
const product = (relative: string) => import(path.join(root, relative));

const readJson = (file: string) =>
    JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

const dimensionTypeFor = (dataType: string | undefined, types: Record<string, string>) => {
    const normalised = (dataType ?? '').toLowerCase();
    if (/int|numeric|decimal|double|real|float/.test(normalised)) return types.NUMBER;
    if (normalised.startsWith('bool')) return types.BOOLEAN;
    if (normalised.startsWith('timestamp')) return types.TIMESTAMP;
    if (normalised === 'date') return types.DATE;
    return types.STRING;
};

const stampSource = (manifest: any, source: Source) => ({
    ...manifest,
    nodes: Object.fromEntries(
        Object.entries(manifest.nodes as Record<string, any>).map(([id, node]) => [
            id,
            (node.resource_type === 'model' || node.resource_type === 'seed') &&
            source.uuid !== null
                ? {
                      ...node,
                      lightdash_source_uuid: source.uuid,
                      lightdash_source_name: source.name,
                  }
                : node,
        ]),
    ),
});

const attributedSourceUuid = (explore: any): string | null =>
    explore.dbtModelIdentity?.sourceUuid ??
    explore.tables?.[explore.baseTable ?? explore.name]?.dbtSourceUuid ??
    explore.dbtSourceUuid ??
    null;

const compileExplores = async (input: {
    adapterType: string;
    sources: Source[];
}) => {
    const common = await product('packages/common/src/index.ts');
    const { DbtBaseProjectAdapter } = await product(
        'packages/backend/src/projectAdapters/dbtBaseProjectAdapter.ts',
    );
    const { PostgresWarehouseClient } = await product(
        'packages/warehouses/src/warehouseClients/PostgresWarehouseClient.ts',
    );
    const warehouseClient = new PostgresWarehouseClient({
        type: 'postgres',
        host: '127.0.0.1',
        port: 1,
        user: 'sim',
        password: 'sim',
        dbname: 'sim',
        schema: 'sim',
    });
    const rows: ExploreRow[] = [];
    const compiled: Record<string, { models: number; validated: number; validationErrors: number }> = {};
    for (const source of input.sources) {
        const manifest = stampSource(
            common.stripExternalDbtNodes(readJson(source.manifestPath)),
            source,
        );
        const models = common
            .getModelsFromManifest(manifest)
            .filter(
                (node: any) =>
                    ['model', 'seed'].includes(node.resource_type) && node.meta,
            );
        const [validated, failed] = DbtBaseProjectAdapter._validateDbtModel(
            input.adapterType,
            models,
            common.getDbtManifestVersion(manifest),
            true,
        );
        const catalog: Record<string, Record<string, Record<string, Record<string, string>>>> = {};
        for (const model of validated) {
            const table = model.alias || model.name;
            catalog[model.database] ??= {};
            catalog[model.database][model.schema] ??= {};
            catalog[model.database][model.schema][table] = Object.fromEntries(
                Object.values(model.columns as Record<string, any>).map((column) => [
                    column.name,
                    dimensionTypeFor(column.data_type, common.DimensionType),
                ]),
            );
        }
        const typed = common.attachTypesToModels(validated, catalog, true, true);
        const explores = await common.convertExplores(
            typed,
            false,
            input.adapterType,
            warehouseClient,
            { spotlight: common.DEFAULT_SPOTLIGHT_CONFIG },
            { includeModelIdentity: true, allowPartialCompilation: true },
        );
        compiled[source.name] = {
            models: models.length,
            validated: validated.length,
            validationErrors: failed.length,
        };
        for (const explore of [...explores, ...failed]) {
            rows.push({
                source: source.name,
                name: explore.name,
                error: common.isExploreError(explore),
                errors: common.isExploreError(explore) ? explore.errors : [],
                dbtModelIdentity: explore.dbtModelIdentity
                    ? {
                          sourceUuid: explore.dbtModelIdentity.sourceUuid,
                          uniqueId: explore.dbtModelIdentity.uniqueId,
                      }
                    : null,
                attributedSourceUuid: common.isExploreError(explore)
                    ? attributedSourceUuid(explore)
                    : null,
            });
        }
    }
    const failedSourceUuids = new Set<string>();
    let successfulCompile = true;
    for (const row of rows) {
        if (!row.error) continue;
        if (row.attributedSourceUuid) failedSourceUuids.add(row.attributedSourceUuid);
        else successfulCompile = false;
    }
    return {
        productSha: gitSha(),
        compiled,
        explores: rows,
        attribution: {
            failedSourceUuids: [...failedSourceUuids].sort(),
            successfulCompile,
            unattributedErrors: rows.filter(
                (row) => row.error && row.attributedSourceUuid === null,
            ).length,
        },
    };
};

const gitSha = () => {
    try {
        const head = fs.readFileSync(path.join(root, '.git'), 'utf8').trim();
        const gitDir = head.startsWith('gitdir: ')
            ? head.slice('gitdir: '.length)
            : path.join(root, '.git');
        const ref = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (!ref.startsWith('ref: ')) return ref;
        const commonDir = fs.existsSync(path.join(gitDir, 'commondir'))
            ? path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim())
            : gitDir;
        return fs.readFileSync(path.join(commonDir, ref.slice(5)), 'utf8').trim();
    } catch {
        return null;
    }
};

const resolveRefs = async (input: {
    binDir: string;
    profilesDir: string;
    profileName: string;
    target: string;
    environment: Record<string, string>;
    concurrency: number;
    tasks: { key: string; projectDir: string; bindings: string[] }[];
    cache: { key: string; manifestPath: string }[] | null;
}) => {
    process.env.PATH = `${input.binDir}${path.delimiter}${process.env.PATH ?? ''}`;
    const common = await product('packages/common/src/index.ts');
    const { DbtCliClient } = await product('packages/backend/src/dbt/dbtCliClient.ts');
    const { scanDbtProject } = await product('packages/backend/src/dbt/dbtProjectScan.ts');
    const { resolveCrossSourceManifests } = await product(
        'packages/backend/src/projectAdapters/crossSourceRefs.ts',
    );
    const { getMissingDbtNodeReferences } = await product(
        'packages/backend/src/dbt/dbtExternalNodes.ts',
    );
    const clients: any[] = [];
    const dbtLogs: Record<string, string[]> = {};
    const tasks = input.tasks.map((spec) => {
        const client = new DbtCliClient({
            dbtProjectDirectory: spec.projectDir,
            dbtProfilesDirectory: input.profilesDir,
            environment: input.environment,
            environmentVariableAllowlist: [],
            explicitCredentials: true,
            profileName: input.profileName,
            target: input.target,
            dbtVersion: common.SupportedDbtVersions.V1_12,
            partialParseBaselinePath: null,
        });
        clients.push(client);
        return {
            key: spec.key,
            context: spec.key,
            prepare: async (options?: { signal?: AbortSignal }) => {
                await client.installDeps(options?.signal);
                return scanDbtProject(spec.projectDir);
            },
            fetch: async (options: { externalNodes: unknown[]; signal?: AbortSignal }) => {
                const started = Date.now();
                try {
                    const result = await client.getDbtManifest(options);
                    return {
                        ...result,
                        timings: { gitRefreshMs: null, depsMs: null, manifestMs: Date.now() - started },
                    };
                } catch (error: any) {
                    dbtLogs[spec.key] = [
                        error?.message ?? String(error),
                        ...((error?.logs ?? []) as any[]).map((log) => log.info?.msg ?? ''),
                    ];
                    throw error;
                }
            },
        };
    });
    const cache = (input.cache ?? []).map((entry) => {
        const manifest = readJson(entry.manifestPath) as any;
        return {
            key: entry.key,
            projectName: manifest.metadata.project_name,
            referencedProjects: [],
            nodes: common.getExternalModelNodesFromManifest(manifest),
        };
    });
    try {
        const resolution = await resolveCrossSourceManifests({
            tasks,
            enabled: true,
            concurrency: input.concurrency,
            cache,
        });
        return {
            productSha: gitSha(),
            ok: true,
            rounds: resolution.rounds,
            warnings: resolution.warnings,
            ownedInjected: resolution.ownedInjected,
            packageNodesOmitted: resolution.packageNodesOmitted,
            results: resolution.results.map((entry: any) => {
                const spec = input.tasks.find((candidate) => candidate.key === entry.task.key)!;
                return {
                    key: entry.task.key,
                    injectedFrom: entry.injectedFrom,
                    projectName: entry.result.manifest.metadata.project_name,
                    bindings: Object.fromEntries(
                        spec.bindings.map((model) => [
                            model,
                            entry.result.manifest.nodes[
                                `model.${entry.result.manifest.metadata.project_name}.${model}`
                            ]?.depends_on?.nodes ?? null,
                        ]),
                    ),
                };
            }),
        };
    } catch (error: any) {
        return {
            productSha: gitSha(),
            ok: false,
            errorClass: error?.constructor?.name ?? null,
            errorName: error?.name ?? null,
            message: error?.message ?? String(error),
            missingRefs: getMissingDbtNodeReferences(error),
            dbtLogs,
        };
    } finally {
        await Promise.all(clients.map((client) => client.cleanup()));
    }
};

const parseMissing = async (input: { text: string }) => {
    const { parseMissingDbtNodeReferences } = await product(
        'packages/backend/src/dbt/dbtExternalNodes.ts',
    );
    return { productSha: gitSha(), missingRefs: parseMissingDbtNodeReferences(input.text) };
};

const cliHint = async (input: {
    binDir: string;
    projectDir: string;
    profilesDir: string;
    profileName: string;
    target: string;
    dbtTexts: Record<string, string>;
}) => {
    process.env.PATH = `${input.binDir}${path.delimiter}${process.env.PATH ?? ''}`;
    const common = await product('packages/common/src/index.ts');
    const { dbtList } = await product('packages/cli/src/handlers/dbt/compile.ts');
    const options = {
        profilesDir: input.profilesDir,
        projectDir: input.projectDir,
        target: input.target,
        profile: input.profileName,
        select: undefined,
        models: undefined,
        vars: undefined,
        threads: undefined,
        noVersionCheck: undefined,
        exclude: undefined,
        selector: undefined,
        state: undefined,
        fullRefresh: undefined,
        skipDbtCompile: undefined,
        skipWarehouseCatalog: undefined,
        useDbtList: true,
        defer: undefined,
        targetPath: undefined,
        favorState: undefined,
        combineManifest: undefined,
    };
    let dbtListError: { errorClass: string | null; message: string } | null = null;
    let models: string[] | null = null;
    try {
        models = await dbtList(options);
    } catch (error: any) {
        dbtListError = {
            errorClass: error?.constructor?.name ?? null,
            message: error?.message ?? String(error),
        };
    }
    return {
        productSha: gitSha(),
        hint: common.CROSS_SOURCE_MODEL_HINT,
        hintedDbtTexts: Object.fromEntries(
            Object.entries(input.dbtTexts).map(([name, text]) => [
                name,
                common.withCrossSourceDbtCliHint(text),
            ]),
        ),
        dbtList: { models, error: dbtListError },
    };
};

const main = async () => {
    const [command, inputPath, outputPath] = process.argv.slice(2);
    if (!command || !inputPath || !outputPath) {
        throw new Error('usage: product_path.ts <compile-explores|resolve-refs|parse-missing|cli-hint> <input.json> <output.json>');
    }
    const input = readJson(inputPath) as any;
    let output: unknown;
    if (command === 'compile-explores') output = await compileExplores(input);
    else if (command === 'resolve-refs') output = await resolveRefs(input);
    else if (command === 'parse-missing') output = await parseMissing(input);
    else if (command === 'cli-hint') output = await cliHint(input);
    else throw new Error(`unknown command ${command}`);
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
};

main().then(
    () => process.exit(0),
    (error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exit(1);
    },
);

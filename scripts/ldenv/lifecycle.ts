import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import {
    benchmarkDependencies,
    moduleLayout,
    buildDiff,
    changedFiles,
    cloneBuilds,
    prepareForkCode,
    dependencies,
    install,
    runTiers,
    sourceHashes,
    sourceHash,
} from './cache';
import { cleanupOrphans, removeOwnedWarm } from './cleanup';
import { restoreInstanceEnv, writeInstanceEnv } from './env';
import {
    claimPorts,
    compose,
    databaseIdentifier,
    diskGuard,
    dotenv,
    dropDatabase,
    ensurePostgres,
    localSecrets,
    machine,
    releasePorts,
    requireLicense,
    sharedEnvironment,
    sharedServices,
    sql,
} from './infra';
import {
    atomicWrite,
    backgroundWork,
    foregroundWork,
    git,
    hashFile,
    home,
    listJson,
    runner,
    saveInstance,
    statePath,
    withLock,
    writeJson,
} from './io';
import {
    assertInstance,
    dotenvText,
    instanceEnvironment,
    instanceId,
    newInstance,
    matchingTiers,
    parseRecipe,
    selectParent,
    seedCommands,
    tierEnvironment,
    type Environment,
    type Instance,
    type Parent,
    type Ports,
} from './model';
import {
    background,
    bridge,
    cancelMonitor,
    currentState,
    dbtEnvironment,
    finishStart,
    startProcesses,
    warmCompileCache,
    seedProjectUuid,
    stopProcesses,
} from './processes';
import { waitForCompilers } from './readiness';
import { populateViteCache, restoreViteCache } from './vite';

export const controlRoot = path.resolve(__dirname, '../..');
export const manifests = path.join(home, 'manifests');
export const parents = () => listJson<Parent>(manifests);
export const instances = () => listJson<Instance>(path.join(home, 'instances'));
export async function rootDirectory(
    directory = process.cwd(),
): Promise<string> {
    return realpath(await git(directory, ['rev-parse', '--show-toplevel']));
}
export async function recipeAt(root: string) {
    return parseRecipe(await readFile(path.join(root, 'rainbow.toml'), 'utf8'));
}
export async function ancestor(
    root: string,
    sha: string,
    ref = 'HEAD',
): Promise<boolean> {
    try {
        await git(root, ['merge-base', '--is-ancestor', sha, ref]);
        return true;
    } catch {
        return false;
    }
}
export async function environment(
    root: string,
    instance: Instance,
    secrets: Environment,
): Promise<Environment> {
    const config = await compose(root);
    const recipe = await recipeAt(root);
    if (!instance.ports) throw new Error('Ports not allocated');
    const env = instanceEnvironment({
        base: await dotenv(path.join(root, '.env.development')),
        recipe: recipe.env,
        local: secrets,
        shared: await sharedEnvironment(root, config),
        worktree: root,
        id: instance.id,
        database: instance.database,
        machine: await machine(),
        ports: instance.ports,
    });
    return { ...env, ...(await dbtEnvironment(root)) };
}
const parentPorts: Ports = {
    pg: 15432,
    frontend: 3000,
    api: 8080,
    scheduler: 8081,
    debug: 9229,
    sdkTest: 3030,
    maple: 4320,
    prometheus: 9090,
};
export async function timed<T>(
    timings: Record<string, number>,
    key: string,
    action: () => Promise<T>,
): Promise<T> {
    const start = Date.now();
    process.stdout.write(`PHASE: ${key}\n`);
    try {
        return await action();
    } finally {
        timings[key] = Date.now() - start;
        process.stdout.write(`TIME: ${key}=${timings[key]}ms\n`);
    }
}
export async function buildParent(
    root: string,
    ref: string,
    refresh = false,
    benchmarkDeps = false,
): Promise<Parent> {
    return backgroundWork(() =>
        withLock('parent-build', async () => {
            const sha = await git(root, [
                'rev-parse',
                '--verify',
                `${ref}^{commit}`,
            ]);
            if (!/^[a-f0-9]{40}$/.test(sha))
                throw new Error('Invalid parent commit');
            const existing = (await parents()).find(
                (parent) => parent.sha === sha,
            );
            if (existing) {
                if (!existing.warehouseDatabase)
                    throw new Error(
                        'This parent predates shared warehouses; rebuild it before use',
                    );
                if ((await moduleLayout(existing.path)) !== 'global')
                    return refreshArtifacts(root, existing);
                if (benchmarkDeps) {
                    await benchmarkDependencies(
                        existing,
                        await dotenv(
                            path.join(existing.path, '.env.development.local'),
                        ),
                    );
                }
                if (!existing.compileCacheWarmedAt) {
                    const env = await dotenv(
                        path.join(existing.path, '.env.development.local'),
                    );
                    await timed(existing.timings, 'compileCacheWarm', () =>
                        warmCompileCache(existing.path, env),
                    );
                    existing.compileCacheWarmedAt = new Date().toISOString();
                    await withLock('parents', () =>
                        writeJson(
                            path.join(manifests, `${sha}.json`),
                            existing,
                        ),
                    );
                }
                existing.seedProjectUuid ??= await seedProjectUuid(
                    existing.path,
                );
                await timed(existing.timings, 'viteCachePopulate', async () => {
                    const result = await populateViteCache(
                        existing.path,
                        await dotenv(
                            path.join(existing.path, '.env.development.local'),
                        ),
                    );
                    existing.viteCache = result;
                    process.stdout.write(
                        `VITE CACHE: ${result.status}: ${result.reason}\n`,
                    );
                });
                await withLock('parents', () =>
                    writeJson(path.join(manifests, `${sha}.json`), existing),
                );
                return existing;
            }
            await diskGuard();
            const secrets = await localSecrets(root);
            requireLicense(secrets);
            const directory = path.join(home, 'parents', sha.slice(0, 12));
            if (existsSync(directory))
                throw new Error(
                    `Unpublished parent remains at ${directory}. Inspect its log and remove only this unpublished worktree and database before retrying.`,
                );
            const timings: Record<string, number> = {};
            const started = Date.now();
            await timed(timings, 'postgres', () => ensurePostgres(root));
            await sharedServices(root, await compose(root), true);
            await mkdir(path.dirname(directory), { recursive: true });
            await git(root, ['worktree', 'add', '--detach', directory, sha]);
            const database = `ldp_${sha.slice(0, 12)}`;
            const metadata = newInstance(directory, sha);
            metadata.database = database;
            metadata.ports = parentPorts;
            const env = await environment(directory, metadata, secrets);
            await atomicWrite(
                path.join(directory, '.env.development.local'),
                dotenvText(env),
            );
            const recipe = await recipeAt(directory);
            const initialHashes = await sourceHashes(directory);
            const warehouseHash = await sourceHash(
                directory,
                'examples/full-jaffle-shop-demo',
            );
            const warehouseDatabase = `ldj_${warehouseHash.slice(0, 12)}`;
            const seeds = seedCommands(recipe.seed.run);
            const previous = refresh
                ? await selectParent(await parents(), (candidate) =>
                      ancestor(root, candidate, sha),
                  ).catch(() => null)
                : null;
            const changed = previous
                ? await changedFiles(directory, previous.sha)
                : [];
            const canAdvance =
                previous &&
                previous.warehouseHash === warehouseHash &&
                !matchingTiers(recipe.tiers, changed).some(
                    (tier) => tier.preset === 'pnpm' || tier.run,
                );
            if (canAdvance) {
                await timed(timings, 'dependencies', () =>
                    dependencies(
                        previous,
                        directory,
                        env,
                        `parent-${sha.slice(0, 12)}`,
                    ),
                );
                await timed(timings, 'artifacts', () =>
                    cloneBuilds(previous, directory),
                );
                await timed(timings, 'databaseClone', () =>
                    sql(
                        root,
                        `CREATE DATABASE ${databaseIdentifier(database)} TEMPLATE ${databaseIdentifier(previous.database)};`,
                    ),
                );
            } else {
                await timed(timings, 'install', () =>
                    install(
                        directory,
                        false,
                        env,
                        `parent-${sha.slice(0, 12)}`,
                    ),
                );
                await timed(timings, 'build', () =>
                    runner.shell(
                        'pnpm formula:build && pnpm common-build && pnpm warehouses-build && pnpm generate-api',
                        {
                            cwd: directory,
                            env,
                            log: path.join(
                                home,
                                'logs',
                                `${sha.slice(0, 12)}-build.log`,
                            ),
                        },
                    ),
                );
                await sql(
                    root,
                    `CREATE DATABASE ${databaseIdentifier(database)};`,
                );
                const migration = recipe.tiers.find((tier) =>
                    tier.files.some((glob) =>
                        glob.includes('/database/migrations/'),
                    ),
                );
                if (!migration?.run)
                    throw new Error('Recipe does not contain a migration tier');
                await timed(timings, 'migrate', () =>
                    runner.shell(migration.run!, {
                        cwd: directory,
                        env: tierEnvironment(env, migration.env),
                        log: path.join(
                            home,
                            'logs',
                            `${sha.slice(0, 12)}-migrate.log`,
                        ),
                    }),
                );
                const warehouseExists = await sql(
                    root,
                    `SELECT datname FROM pg_database WHERE datname='${warehouseDatabase}';`,
                );
                if (!warehouseExists) {
                    await sql(
                        root,
                        `CREATE DATABASE ${databaseIdentifier(warehouseDatabase)};`,
                    );
                    await timed(timings, 'warehouseSeed', () =>
                        runner.shell(seeds.warehouse, {
                            cwd: directory,
                            env: {
                                ...tierEnvironment(env, recipe.seed.env),
                                PGDATABASE: warehouseDatabase,
                            },
                            log: path.join(
                                home,
                                'logs',
                                `${warehouseDatabase}-seed.log`,
                            ),
                        }),
                    );
                    await sql(
                        root,
                        `CREATE TABLE public.ldenv_warehouse_complete (hash text PRIMARY KEY); INSERT INTO public.ldenv_warehouse_complete VALUES ('${warehouseHash}');`,
                        warehouseDatabase,
                    );
                }
                const warehouseMarker = await sql(
                    root,
                    'SELECT hash FROM public.ldenv_warehouse_complete;',
                    warehouseDatabase,
                );
                if (warehouseMarker !== warehouseHash)
                    throw new Error(
                        'Warehouse seed marker does not match source hash',
                    );
                await timed(timings, 'applicationSeed', () =>
                    runner.shell(seeds.application, {
                        cwd: directory,
                        env: {
                            ...tierEnvironment(env, recipe.seed.env),
                            PGDATABASE: warehouseDatabase,
                            PGCONNECTIONURI: `postgresql://postgres:password@127.0.0.1:${env.PGPORT}/${database}`,
                        },
                        log: path.join(
                            home,
                            'logs',
                            `${sha.slice(0, 12)}-seed.log`,
                        ),
                    }),
                );
            }
            const check = await sql(
                root,
                "SELECT (EXISTS(SELECT 1 FROM emails WHERE email='demo@lightdash.com') AND EXISTS(SELECT 1 FROM embedding) AND EXISTS(SELECT 1 FROM cached_explore))::text;",
                database,
            );
            if (check !== 'true')
                throw new Error(
                    'Seed checks failed; parent remains unpublished',
                );
            await sql(
                root,
                `CREATE TABLE IF NOT EXISTS public.ldenv_seed_complete (sha text PRIMARY KEY, completed_at timestamptz NOT NULL DEFAULT now()); DELETE FROM public.ldenv_seed_complete; INSERT INTO public.ldenv_seed_complete(sha) VALUES ('${sha}');`,
                database,
            );
            await sql(
                root,
                `ALTER DATABASE ${databaseIdentifier(database)} ALLOW_CONNECTIONS false; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database}'; ALTER DATABASE ${databaseIdentifier(database)} IS_TEMPLATE true;`,
            );
            const manifest: Parent = {
                seedProjectUuid: await seedProjectUuid(directory),
                sha,
                warehouseDatabase,
                warehouseHash,
                path: directory,
                database,
                builtAt: new Date().toISOString(),
                lockHash: await hashFile(
                    path.join(directory, 'pnpm-lock.yaml'),
                ),
                sourceHashes: {
                    ...initialHashes,
                    'packages/backend/src/generated': (
                        await sourceHashes(directory)
                    )['packages/backend/src/generated'],
                },
                migrations: [],
                timings,
                seedComplete: true,
                nodeVersion: process.version,
                pnpmVersion: await runner.run('pnpm', ['--version'], {
                    cwd: directory,
                }),
                platform: process.platform,
                arch: process.arch,
            };
            manifest.migrations = (
                await git(directory, [
                    'ls-files',
                    '--',
                    'packages/backend/src/database/migrations',
                    'packages/backend/src/ee/database/migrations',
                ])
            )
                .split('\n')
                .filter(Boolean);
            if (benchmarkDeps)
                await timed(timings, 'dependencyBenchmark', () =>
                    benchmarkDependencies(manifest, env),
                );
            await timed(timings, 'compileCacheWarm', () =>
                warmCompileCache(directory, env),
            );
            await timed(timings, 'viteCachePopulate', async () => {
                const result = await populateViteCache(directory, env);
                manifest.viteCache = result;
                process.stdout.write(
                    `VITE CACHE: ${result.status}: ${result.reason}\n`,
                );
            });
            manifest.compileCacheWarmedAt = new Date().toISOString();
            timings.total = Date.now() - started;
            await withLock('parents', () =>
                writeJson(path.join(manifests, `${sha}.json`), manifest),
            );
            return manifest;
        }),
    );
}
async function refreshArtifacts(
    root: string,
    previous: Parent,
): Promise<Parent> {
    const started = Date.now();
    const directory = path.join(
        home,
        'parents',
        `${previous.sha.slice(0, 12)}-cache-${Date.now()}`,
    );
    await git(root, ['worktree', 'add', '--detach', directory, previous.sha]);
    const metadata = newInstance(directory, previous.sha);
    metadata.database = previous.database;
    metadata.ports = parentPorts;
    const env = await environment(
        directory,
        metadata,
        await localSecrets(previous.path),
    );
    await atomicWrite(
        path.join(directory, '.env.development.local'),
        dotenvText(env),
    );
    const timings: Record<string, number> = {};
    await timed(timings, 'install', () =>
        install(directory, true, env, `parent-${previous.sha.slice(0, 12)}`),
    );
    await timed(timings, 'build', () =>
        runner.shell(
            'pnpm formula:build && pnpm common-build && pnpm warehouses-build && pnpm generate-api',
            {
                cwd: directory,
                env,
                log: path.join(
                    home,
                    'logs',
                    `${previous.sha.slice(0, 12)}-refresh.log`,
                ),
            },
        ),
    );
    await timed(timings, 'compileCacheWarm', () =>
        warmCompileCache(directory, env),
    );
    const viteCache = await timed(timings, 'viteCachePopulate', async () => {
        const result = await populateViteCache(directory, env);
        process.stdout.write(
            `VITE CACHE: ${result.status}: ${result.reason}\n`,
        );
        return result;
    });
    const refreshed: Parent = {
        compileCacheWarmedAt: new Date().toISOString(),
        ...previous,
        viteCache,
        seedProjectUuid: await seedProjectUuid(directory),
        path: directory,
        retiredPaths: [...(previous.retiredPaths ?? []), previous.path],
        builtAt: new Date().toISOString(),
        pnpmVersion: await runner.run('pnpm', ['--version'], {
            cwd: directory,
        }),
        sourceHashes: await sourceHashes(directory),
        timings: { ...timings, total: Date.now() - started },
    };
    await withLock('parents', () =>
        writeJson(path.join(manifests, `${previous.sha}.json`), refreshed),
    );
    return refreshed;
}
export async function up(
    ...args: Parameters<typeof upInstance>
): Promise<Instance> {
    return foregroundWork(() => upInstance(...args));
}
async function upInstance(
    root: string,
    requested: string | null,
    noWait: boolean,
    kind: Instance['kind'] = 'worktree',
    inheritedSecrets: Environment | null = null,
): Promise<Instance> {
    await garbageCollect(root);
    return withLock(instanceId(root), async () => {
        const existing = await currentState(instanceId(root));
        if (existing) {
            if (existing.phase === 'ready' || existing.phase === 'starting')
                return existing;
            if (existing.phase === 'stopped') return start(existing, noWait);
            throw new Error(
                'A partial instance exists. Inspect status, then ldenv down before retrying.',
            );
        }
        const secrets = inheritedSecrets ?? (await localSecrets(root));
        if (!secrets.LIGHTDASH_LICENSE_KEY) {
            const parent = await selectParent(
                await parents(),
                (sha) => ancestor(root, sha),
                requested,
            );
            const inherited = await localSecrets(parent.path);
            if (inherited.LIGHTDASH_LICENSE_KEY)
                secrets.LIGHTDASH_LICENSE_KEY = inherited.LIGHTDASH_LICENSE_KEY;
        }
        requireLicense(secrets);
        const pinned = await dotenv(path.join(root, '.env.development.local'));
        if (pinned.LD_INSTANCE_ID && pinned.LD_INSTANCE_ID !== instanceId(root))
            throw new Error(
                'This worktree is configured for another instance; refusing to replace its env',
            );
        let instance: Instance | null = null;
        try {
            const parent = await withLock('parents', async () => {
                const selected = await selectParent(
                    await parents(),
                    (sha) => ancestor(root, sha),
                    requested,
                );
                if (
                    selected.platform !== process.platform ||
                    selected.arch !== process.arch ||
                    selected.nodeVersion !== process.version
                )
                    throw new Error(
                        'Parent runtime differs; build a parent with this Node/platform first',
                    );
                instance = newInstance(root, selected.sha, kind);
                await saveInstance(instance);
                return selected;
            });
            const state = instance! as Instance;
            await timed(state.timings, 'postgres', () => ensurePostgres(root));
            const config = await compose(root);
            await timed(state.timings, 'sharedCheck', () =>
                sharedServices(root, config, true),
            );
            const preliminary = instanceEnvironment({
                base: {},
                recipe: {},
                local: secrets,
                shared: {},
                worktree: root,
                id: state.id,
                database: state.database,
                machine: await machine(),
                ports: parentPorts,
            });
            const results = await Promise.allSettled([
                timed(state.timings, 'ports', async () => {
                    state.ports = await claimPorts(root, state.id);
                }),
                timed(state.timings, 'databaseClone', () =>
                    sql(
                        root,
                        `CREATE DATABASE ${databaseIdentifier(state.database)} TEMPLATE ${databaseIdentifier(parent.database)};`,
                    ),
                ),
                timed(state.timings, 'codeClone', async () => {
                    await prepareForkCode(
                        parent,
                        root,
                        preliminary,
                        state.id,
                        state.timings,
                    );
                }),
            ]);
            const failure = results.find(
                (result) => result.status === 'rejected',
            );
            if (failure?.status === 'rejected') throw failure.reason;
            const marker = await sql(
                root,
                'SELECT sha FROM public.ldenv_seed_complete;',
                state.database,
            );
            if (marker !== parent.sha)
                throw new Error('Cloned seed marker does not match parent');
            const env = await environment(root, state, secrets);
            await writeInstanceEnv(state, env);
            const diff = await buildDiff(parent, root);
            const recipe = await recipeAt(root);
            const frontend = async () => {
                await timed(state.timings, 'viteCacheRestore', async () => {
                    const result = await restoreViteCache(
                        parent.path,
                        root,
                        env,
                    );
                    state.viteCache = result;
                    state.timings.viteCacheHit =
                        result.status === 'hit' ? 1 : 0;
                    process.stdout.write(
                        `VITE CACHE: ${result.status}: ${result.reason}\n`,
                    );
                });
                await timed(state.timings, 'frontendStart', () =>
                    startProcesses(state, 'frontend'),
                );
            };
            const warehouse = () =>
                timed(state.timings, 'warehouse', () =>
                    bridge(
                        state,
                        'dbt-path',
                        parent.seedProjectUuid
                            ? {
                                  LDENV_SEED_PROJECT_UUID:
                                      parent.seedProjectUuid,
                              }
                            : {},
                    ),
                );
            let preparations: PromiseSettledResult<void>[];
            if (matchingTiers(recipe.tiers, diff).length === 0) {
                preparations = await Promise.allSettled([
                    frontend(),
                    warehouse(),
                    prepareWatchers(state),
                ]);
            } else {
                await frontend();
                await runTiers(
                    root,
                    recipe,
                    diff,
                    env,
                    state.timings,
                    state.id,
                );
                preparations = await Promise.allSettled([
                    warehouse(),
                    prepareWatchers(state),
                ]);
            }
            const preparationFailure = preparations.find(
                (result) => result.status === 'rejected',
            );
            if (preparationFailure?.status === 'rejected')
                throw preparationFailure.reason;
            if (kind === 'warming')
                await timed(state.timings, 'compileCacheWarm', () =>
                    warmCompileCache(root, env),
                );
            await saveInstance(state);
            return await start(state, noWait);
        } catch (error) {
            if (instance) {
                const state = instance as Instance;
                state.phase = 'failed';
                state.error = runner.redact(
                    error instanceof Error ? error.message : String(error),
                );
                await saveInstance(state);
            }
            throw error;
        }
    });
}
async function prepareWatchers(instance: Instance): Promise<void> {
    await timed(instance.timings, 'watchersSettle', async () => {
        await timed(instance.timings, 'watchersLaunch', () =>
            startProcesses(instance, 'watchers'),
        );
        await timed(instance.timings, 'watchersWait', () =>
            waitForCompilers(instance),
        );
    });
}
export async function start(
    ...args: Parameters<typeof startInstance>
): Promise<Instance> {
    return foregroundWork(() => startInstance(...args));
}
async function startInstance(
    instance: Instance,
    noWait: boolean,
): Promise<Instance> {
    assertInstance(instance);
    if (instance.phase === 'stopped' || instance.phase === 'failed') {
        instance.startedAt = new Date().toISOString();
        instance.processStartedAt = instance.startedAt;
        instance.timings = {};
    }
    await ensurePostgres(controlRoot);
    await sharedServices(
        instance.worktree,
        await compose(instance.worktree),
        true,
    );
    instance.phase = 'starting';
    instance.error = null;
    instance.readyAt = null;
    if (!instance.timings.frontendStart)
        await timed(instance.timings, 'frontendStart', () =>
            startProcesses(instance, 'frontend'),
        );
    if (!instance.timings.watchersSettle) await prepareWatchers(instance);
    await timed(instance.timings, 'pm2', () => startProcesses(instance, 'api'));
    await saveInstance(instance);
    if (noWait) {
        instance.monitorPid = await background(
            ['monitor', instance.id],
            `${instance.id}-monitor`,
        );
        await saveInstance(instance);
    } else await finishStart(instance);
    return instance;
}
export async function down(instance: Instance): Promise<void> {
    assertInstance(instance);
    await cancelMonitor(instance);
    await stopProcesses(instance, true);
    await ensurePostgres(controlRoot);
    await dropDatabase(controlRoot, instance.database);
    await releasePorts(controlRoot, instance.id, instance.worktree);
    const retainedBackup = await restoreInstanceEnv(instance);
    if (retainedBackup)
        process.stdout.write(
            `ENV RESTORE SKIPPED: current env differs; original retained at ${retainedBackup}\n`,
        );
    await removeOwnedWarm(instance, controlRoot);
    await rm(statePath(instance.id));
}
export async function garbageCollect(
    root: string,
    sweepOrphans = false,
): Promise<void> {
    for (const instance of await instances()) {
        assertInstance(instance);
        if (!existsSync(instance.worktree))
            await withLock(instance.id, () => down(instance));
    }
    if (sweepOrphans) await cleanupOrphans(root, false);
}
export async function parentGc(root: string, keep: number): Promise<void> {
    if (!Number.isInteger(keep) || keep < 1)
        throw new Error('--keep must be at least 1');
    await withLock('parent-build', () =>
        withLock('parents', async () => {
            const pinned = new Set(
                (await instances()).map((instance) => instance.parent),
            );
            const all = (await parents()).sort((a, b) =>
                b.builtAt.localeCompare(a.builtAt),
            );
            for (const parent of all
                .slice(keep)
                .filter((item) => !pinned.has(item.sha))) {
                const paths = [parent.path, ...(parent.retiredPaths ?? [])];
                if (
                    paths.some(
                        (directory) =>
                            path.dirname(directory) !==
                                path.join(home, 'parents') ||
                            !new RegExp(
                                `^${parent.sha.slice(0, 12)}(-cache-[0-9]+)?$`,
                            ).test(path.basename(directory)),
                    ) ||
                    parent.database !== `ldp_${parent.sha.slice(0, 12)}`
                )
                    throw new Error('Invalid parent ownership record');
                await ensurePostgres(root);
                await dropDatabase(root, parent.database);
                for (const directory of paths)
                    await git(root, [
                        'worktree',
                        'remove',
                        '--force',
                        directory,
                    ]);
                await rm(path.join(manifests, `${parent.sha}.json`));
                if (
                    parent.warehouseDatabase &&
                    !(await parents()).some(
                        (item) =>
                            item.warehouseDatabase === parent.warehouseDatabase,
                    )
                ) {
                    await dropDatabase(root, parent.warehouseDatabase);
                }
            }
        }),
    );
}

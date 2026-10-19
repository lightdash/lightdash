import { DbtError, SupportedDbtVersions } from '@lightdash/common';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { parseArgs } from 'util';
import { type DbtCliClient as Client } from '../packages/backend/src/dbt/dbtCliClient';

const main = async () => {
    process.env.LIGHTDASH_SECRET ??= 'cross-source-bench-local-only';
    process.env.SITE_URL ??= 'http://cross-source-bench.invalid';
    process.env.S3_ENDPOINT ??= 'http://127.0.0.1:9000';
    process.env.S3_BUCKET ??= 'cross-source-bench';
    process.env.S3_REGION ??= 'us-east-1';
    const { DbtCliClient } =
        await import('../packages/backend/src/dbt/dbtCliClient');
    const { scanDbtProject } =
        await import('../packages/backend/src/dbt/dbtProjectScan');
    const { resolveCrossSourceManifests } =
        await import('../packages/backend/src/projectAdapters/crossSourceRefs');
    const { default: logger } =
        await import('../packages/backend/src/logging/logger');
    logger.silent = true;
    const { values, positionals } = parseArgs({
        options: {
            projects: { type: 'string' },
            profiles: { type: 'string' },
            concurrency: { type: 'string', default: '3' },
            work: { type: 'string' },
            warm: { type: 'boolean', default: false },
            'disable-scan': { type: 'boolean', default: false },
            only: { type: 'string', multiple: true },
        },
        allowPositionals: true,
    });
    if (!values.projects || !values.profiles)
        throw new Error('--projects and --profiles are required');
    const concurrency = Number(values.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error('--concurrency must be a positive integer');
    const projectsDir = path.resolve(values.projects);
    const profilesDir = path.resolve(values.profiles);
    const only = [...(values.only ?? []), ...positionals];
    const projects: string[] = [];
    for (const entry of await fs.readdir(projectsDir, {
        withFileTypes: true,
    })) {
        if (
            !entry.isDirectory() ||
            (only.length > 0 && !only.includes(entry.name))
        )
            continue;
        try {
            await fs.access(
                path.join(projectsDir, entry.name, 'dbt_project.yml'),
            );
            projects.push(entry.name);
        } catch {
            continue;
        }
    }
    if (projects.length === 0) throw new Error('No dbt projects found');
    const work = values.work
        ? path.resolve(values.work)
        : path.join(
              os.tmpdir(),
              `cross-source-bench-${createHash('sha256').update(projectsDir).digest('hex').slice(0, 12)}`,
          );
    const clients: Client[] = [];
    let runs = 0;
    let failures = 0;
    const startedAt = Date.now();
    try {
        const tasks = [];
        for (const project of projects) {
            const projectDir = path.join(projectsDir, project);
            const target = path.join(work, project);
            if (!values.warm)
                await fs.rm(target, { recursive: true, force: true });
            await fs.mkdir(target, { recursive: true });
            const client = new DbtCliClient({
                dbtProjectDirectory: projectDir,
                dbtProfilesDirectory: profilesDir,
                environment: {
                    PGHOST: '127.0.0.1',
                    PGPORT: '15432',
                    PGUSER: 'postgres',
                    PGPASSWORD: 'x',
                    PGDATABASE: 'postgres',
                    SEED_SCHEMA: `cross_source_refs_${project}`,
                },
                environmentVariableAllowlist: [],
                explicitCredentials: true,
                dbtVersion: SupportedDbtVersions.V1_12,
                partialParseBaselinePath: path.join(target, 'baseline.msgpack'),
            });
            client.targetDirectory = target;
            clients.push(client);
            let prepared: Promise<void> | null = null;
            const prepare = () => {
                prepared ??= client.installDeps();
                return prepared;
            };
            tasks.push({
                key: project,
                context: project,
                prepare: async () => {
                    await prepare();
                    return values['disable-scan']
                        ? null
                        : scanDbtProject(projectDir);
                },
                fetch: async (
                    options: Parameters<Client['getDbtManifest']>[0],
                ) => {
                    await prepare();
                    runs += 1;
                    const started = Date.now();
                    try {
                        const result = await client.getDbtManifest(options);
                        return {
                            ...result,
                            timings: {
                                gitRefreshMs: null,
                                depsMs: null,
                                manifestMs: Date.now() - started,
                            },
                        };
                    } catch (error) {
                        failures += 1;
                        throw error;
                    }
                },
            });
        }
        const resolution = await resolveCrossSourceManifests({
            tasks,
            enabled: true,
            concurrency,
        });
        process.stdout.write(
            `${JSON.stringify({ projects: projects.length, runs, failures, rounds: resolution.rounds, wallMs: Date.now() - startedAt, warnings: resolution.warnings })}\n`,
        );
    } finally {
        if (!values.warm) {
            for (const client of clients) {
                await client.cleanup();
                for (const generated of ['target', 'logs', 'dbt_packages']) {
                    await fs.rm(
                        path.join(client.dbtProjectDirectory, generated),
                        { recursive: true, force: true },
                    );
                }
            }
            if (!values.work)
                await fs.rm(work, { recursive: true, force: true });
        }
    }
};

void main().catch((error: unknown) => {
    if (error instanceof DbtError)
        error.logs
            ?.filter((log) => log.info.level === 'error')
            .forEach((log) => process.stderr.write(`${log.info.msg}\n`));
    process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
});

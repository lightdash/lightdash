import { parse as parseEnv } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { home, readJson, runner, waitUntil, withLock, writeJson } from './io';
import { json, type Environment, type Machine, type Ports } from './model';

export type ComposeService = {
    ports?: { target: number; published: string }[];
    environment?: Environment;
    profiles?: string[];
};
export type Compose = { services: Record<string, ComposeService> };
export type Container = {
    Id: string;
    Name: string;
    State: { Running: boolean; Status: string };
    Config: { Labels: Record<string, string>; Image: string };
    Mounts: { Name: string; Destination: string }[];
    NetworkSettings: {
        Ports: Record<string, { HostPort: string; HostIp: string }[] | null>;
        Networks: Record<string, { Gateway: string }>;
    };
};
export async function dotenv(file: string): Promise<Environment> {
    return existsSync(file) ? parseEnv(await readFile(file)) : {};
}
export async function localSecrets(root: string): Promise<Environment> {
    const env = await dotenv(path.join(root, '.env.development.local'));
    for (const key of [
        'LIGHTDASH_LICENSE_KEY',
        'LIGHTDASH_LICENSE_CERTIFICATE',
        'LDENV_STANDALONE_SCHEDULER',
        'LDENV_TRACING',
    ]) {
        if (process.env[key]) env[key] = process.env[key]!;
    }
    runner.protect(env);
    return env;
}
export function requireLicense(env: Environment): void {
    if (
        !env.LIGHTDASH_LICENSE_KEY ||
        env.LIGHTDASH_LICENSE_KEY === 'dummy-build-key'
    )
        throw new Error(
            'Set LIGHTDASH_LICENSE_KEY in .env.development.local (the same source as dev-fast-start), or export it. The development seed needs EE migrations.',
        );
}
export async function compose(root: string): Promise<Compose> {
    return json<Compose>(
        await runner.run(
            'docker',
            [
                'compose',
                '-p',
                'ld-shared',
                '-f',
                'docker/docker-compose.dev.shared.yml',
                '--env-file',
                '.env.development',
                'config',
                '--format',
                'json',
            ],
            { cwd: root },
        ),
    );
}
export function publishedEndpoint(url: string, config: Compose): string {
    const endpoint = new URL(url);
    const service = config.services[endpoint.hostname];
    if (!service)
        throw new Error(`No shared compose service for ${endpoint.hostname}`);
    const target = Number(
        endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
    );
    const mapping = service.ports?.find(
        (port) => Number(port.target) === target,
    );
    if (!mapping)
        throw new Error(`No published port for ${endpoint.hostname}:${target}`);
    endpoint.hostname = 'localhost';
    endpoint.port = String(mapping.published);
    return endpoint.toString().replace(/\/$/, '');
}
export async function sharedEnvironment(
    root: string,
    config: Compose,
): Promise<Environment> {
    const base = await dotenv(path.join(root, '.env.development'));
    const port = (service: string, target: number) => {
        const result = config.services[service]?.ports?.find(
            (item) => Number(item.target) === target,
        );
        if (!result)
            throw new Error(`Shared compose needs ${service}:${target}`);
        return String(result.published);
    };
    const storage = Object.fromEntries(
        Object.entries(base).filter(
            ([key]) => key.startsWith('S3_') || key.startsWith('APPS_S3_'),
        ),
    );
    return {
        ...storage,
        S3_ENDPOINT: publishedEndpoint(base.S3_ENDPOINT, config),
        S3_PUBLIC_ENDPOINT: publishedEndpoint(base.S3_ENDPOINT, config),
        HEADLESS_BROWSER_HOST: 'localhost',
        HEADLESS_BROWSER_PORT: port('headless-browser', 3000),
        EMAIL_SMTP_HOST: 'localhost',
        EMAIL_SMTP_PORT: port('mailpit', 1025),
        EMAIL_SMTP_SECURE: 'false',
        EMAIL_SMTP_USE_AUTH: 'false',
        EMAIL_SMTP_ALLOW_INVALID_CERT: 'true',
        NATS_URL: `nats://localhost:${port('nats', 4222)}`,
    };
}
export async function containers(
    root: string,
    filter: string,
): Promise<Container[]> {
    const ids = (
        await runner.run('docker', ['ps', '-aq', '--filter', filter], {
            cwd: root,
        })
    )
        .split('\n')
        .filter(Boolean);
    return ids.length
        ? json<Container[]>(
              await runner.run('docker', ['inspect', ...ids], { cwd: root }),
          )
        : [];
}
export async function sharedServices(
    root: string,
    config: Compose,
    start: boolean,
): Promise<{ service: string; id: string; running: boolean }[]> {
    const found = await containers(
        root,
        'label=com.docker.compose.project=ld-shared',
    );
    const services = Object.entries(config.services).filter(
        ([, service]) => !service.profiles?.length,
    );
    const result = [];
    for (const [service] of services) {
        const matches = found.filter(
            (container) =>
                container.Config.Labels['com.docker.compose.service'] ===
                service,
        );
        if (matches.length !== 1)
            throw new Error(
                `Expected one existing ld-shared ${service} container; found ${matches.length}. Provision shared infrastructure separately. ldenv will never create or replace it.`,
            );
        const container = matches[0];
        if (!container.State.Running && start) {
            if (!['exited', 'created'].includes(container.State.Status))
                throw new Error(
                    `Shared ${service} is ${container.State.Status}; refusing to change it`,
                );
            await runner.run('docker', ['start', container.Id], { cwd: root });
        }
        result.push({
            service,
            id: container.Id,
            running: container.State.Running || start,
        });
    }
    return result;
}
export async function machine(): Promise<Machine> {
    return readJson<Machine>(path.join(home, 'machine.json'));
}
export async function freeDisk(): Promise<number> {
    const stats = await statfs(existsSync(home) ? home : os.homedir());
    return stats.bavail * stats.bsize;
}
export async function diskGuard(): Promise<void> {
    const floor = Number(process.env.LDENV_MIN_FREE_GB ?? '8') * 1e9;
    if (!Number.isFinite(floor) || floor < 1e9)
        throw new Error('LDENV_MIN_FREE_GB must be at least 1');
    const available = await freeDisk();
    if (available < floor)
        throw new Error(
            `Need ${(floor / 1e9).toFixed(1)} GB free; have ${(available / 1e9).toFixed(1)} GB. Free ${((floor - available) / 1e9).toFixed(1)} GB before building a parent or spare.`,
        );
}
export async function ensurePostgres(root: string): Promise<Machine> {
    return withLock('postgres', async () => {
        await mkdir(home, { recursive: true, mode: 0o700 });
        const configFile = path.join(home, 'machine.json');
        const config = existsSync(configFile)
            ? await machine()
            : {
                  pgPort: Number(process.env.LDENV_PG_PORT ?? 15432),
                  secret: randomBytes(32).toString('hex'),
              };
        if (
            !Number.isInteger(config.pgPort) ||
            config.pgPort < 1024 ||
            config.pgPort > 65535
        )
            throw new Error('Invalid LDENV_PG_PORT');
        const found = await containers(root, 'name=^/ldenv-pg$');
        if (found.length) {
            const container = found[0];
            if (
                !existsSync(configFile) ||
                container.Config.Labels['dev.lightdash.ldenv'] !== 'postgres' ||
                container.Config.Image !== 'pgvector/pgvector:pg18' ||
                !container.Mounts.some(
                    (mount) =>
                        mount.Name === 'ldenv_pg_data' &&
                        mount.Destination === '/var/lib/postgresql',
                ) ||
                !container.NetworkSettings.Ports['5432/tcp']?.some(
                    (port) =>
                        port.HostPort === String(config.pgPort) &&
                        port.HostIp === '127.0.0.1',
                )
            )
                throw new Error(
                    'ldenv-pg ownership/configuration mismatch; refusing to replace it',
                );
            if (!container.State.Running)
                await runner.run('docker', ['start', container.Id], {
                    cwd: root,
                });
        } else {
            const volumeIds = await runner.run(
                'docker',
                ['volume', 'ls', '-q', '--filter', 'name=^ldenv_pg_data$'],
                { cwd: root },
            );
            if (volumeIds && !existsSync(configFile))
                throw new Error(
                    'Existing ldenv volume has no machine secret; refusing to adopt it',
                );
            await writeJson(configFile, config);
            if (!volumeIds)
                await runner.run(
                    'docker',
                    [
                        'volume',
                        'create',
                        '--label',
                        'dev.lightdash.ldenv=postgres',
                        'ldenv_pg_data',
                    ],
                    { cwd: root },
                );
            await runner.run(
                'docker',
                [
                    'run',
                    '-d',
                    '--name',
                    'ldenv-pg',
                    '--label',
                    'dev.lightdash.ldenv=postgres',
                    '--restart',
                    'unless-stopped',
                    '-p',
                    `127.0.0.1:${config.pgPort}:5432`,
                    '-e',
                    'POSTGRES_PASSWORD=password',
                    '-v',
                    'ldenv_pg_data:/var/lib/postgresql',
                    'pgvector/pgvector:pg18',
                ],
                { cwd: root },
            );
        }
        await waitUntil(
            async () => {
                try {
                    await runner.run(
                        'docker',
                        ['exec', 'ldenv-pg', 'pg_isready', '-U', 'postgres'],
                        { cwd: root, timeout: 5000 },
                    );
                    return true;
                } catch {
                    return false;
                }
            },
            60000,
            'ldenv PostgreSQL',
        );
        return config;
    });
}
export function databaseIdentifier(name: string): string {
    if (
        !/^(ldp_[a-f0-9]{12}|ldj_[a-f0-9]{12}|ld_ldenv_[a-f0-9]{16})$/.test(
            name,
        )
    )
        throw new Error(
            'Refusing to operate on a database outside the ldenv namespace',
        );
    return `"${name}"`;
}
export async function sql(
    root: string,
    statement: string,
    database = 'postgres',
): Promise<string> {
    return runner.run(
        'docker',
        [
            'exec',
            '-i',
            'ldenv-pg',
            'psql',
            '-X',
            '-U',
            'postgres',
            '-d',
            database,
            '-v',
            'ON_ERROR_STOP=1',
            '-At',
        ],
        { cwd: root, input: statement },
    );
}
export async function dropDatabase(root: string, name: string): Promise<void> {
    const identifier = databaseIdentifier(name);
    const present = await sql(
        root,
        `SELECT datname FROM pg_database WHERE datname='${name}';`,
    );
    if (!present) return;
    await sql(
        root,
        `ALTER DATABASE ${identifier} IS_TEMPLATE false; ALTER DATABASE ${identifier} ALLOW_CONNECTIONS false; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}' AND pid <> pg_backend_pid();`,
    );
    await sql(root, `DROP DATABASE ${identifier};`);
    if (
        await sql(
            root,
            `SELECT datname FROM pg_database WHERE datname='${name}';`,
        )
    )
        throw new Error('Database still exists after drop');
}
export async function claimPorts(root: string, id: string): Promise<Ports> {
    await runner.run(
        'bash',
        [path.join(__dirname, '../dev-ports.sh'), 'claim', '--instance-id', id],
        { cwd: root },
    );
    const registration = json<{
        worktreePath: string;
        instanceId: string;
        ports: Ports;
    }>(
        await runner.run(
            'bash',
            [
                path.join(__dirname, '../dev-ports.sh'),
                'show',
                '--instance-id',
                id,
            ],
            { cwd: root },
        ),
    );
    if (registration.worktreePath !== root || registration.instanceId !== id)
        throw new Error('Port slot belongs to another worktree');
    return registration.ports;
}
export async function releasePorts(
    root: string,
    id: string,
    worktree: string,
): Promise<void> {
    const registrationFile = path.join(
        os.homedir(),
        '.lightdash/dev-instances',
        `${id}.json`,
    );
    if (!existsSync(registrationFile)) return;
    const registration = await readJson<{ worktreePath: string }>(
        registrationFile,
    );
    if (registration.worktreePath !== worktree)
        throw new Error('Refusing to release another worktree port slot');
    await runner.run(
        'bash',
        [
            path.join(root, 'scripts/dev-ports.sh'),
            'release',
            '--instance-id',
            id,
        ],
        { cwd: root },
    );
    if (existsSync(registrationFile))
        throw new Error('Port slot remains after release');
}

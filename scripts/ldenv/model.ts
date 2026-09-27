import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'smol-toml';

export type Environment = Record<string, string>;
export type Tier = {
    name: string;
    preset: string | null;
    files: string[];
    run: string | null;
    env: Environment;
    watch: string[];
};
export type Recipe = {
    env: Environment;
    tiers: Tier[];
    seed: { run: string; env: Environment };
    warm: string[];
    paint: { selector: string; timeout: number };
};
export type Ports = {
    pg: number;
    frontend: number;
    api: number;
    scheduler: number;
    debug: number;
    sdkTest: number;
    maple: number;
    prometheus: number;
};
export type Parent = {
    retiredPaths?: string[];
    compileCacheWarmedAt?: string;
    warehouseDatabase: string;
    warehouseHash: string;
    sha: string;
    path: string;
    database: string;
    builtAt: string;
    lockHash: string;
    sourceHashes: Record<string, string>;
    migrations: string[];
    timings: Record<string, number>;
    seedComplete: boolean;
    nodeVersion: string;
    pnpmVersion: string;
    platform: string;
    arch: string;
};
export type Instance = {
    kind: 'worktree' | 'warming' | 'spare' | 'claimed';
    id: string;
    worktree: string;
    adoptedFrom?: string;
    parent: string;
    database: string;
    ports: Ports | null;
    phase:
        | 'preparing'
        | 'starting'
        | 'ready'
        | 'degraded'
        | 'stopped'
        | 'failed';
    createdAt: string;
    startedAt: string;
    updatedAt: string;
    timings: Record<string, number>;
    error: string | null;
    monitorPid: number | null;
    readyAt: string | null;
    verification: {
        state: 'pending' | 'passed' | 'failed';
        checkedAt: string | null;
        error: string | null;
        timings: Record<string, number>;
    } | null;
};
export type Machine = { pgPort: number; secret: string };

export function json<T>(source: string): T {
    try {
        return JSON.parse(source) as T;
    } catch {
        throw new Error(
            'Invalid JSON; refusing to replace or ignore existing state',
        );
    }
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected a recipe table');
    return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
    if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === 'string')
    )
        throw new Error('Expected a list of strings');
    return value;
}
function environment(value: unknown): Environment {
    const values = object(value);
    if (!Object.values(values).every((item) => typeof item === 'string'))
        throw new Error('Recipe env values must be strings');
    return values as Environment;
}
export function parseRecipe(source: string): Recipe {
    const raw = parse(source);
    if (!Array.isArray(raw.tier))
        throw new Error('rainbow.toml needs [[tier]]');
    const seed = object(raw.seed);
    if (typeof seed.run !== 'string')
        throw new Error('rainbow.toml needs seed.run');
    const paint = object(object(raw.ready).paints);
    if (
        typeof paint.selector !== 'string' ||
        typeof paint.within !== 'string' ||
        !/^\d+s$/.test(paint.within)
    )
        throw new Error('Unsupported paint gate');
    return {
        env: environment(raw.env),
        tiers: raw.tier.map((value, index) => {
            const tier = object(value);
            if (tier.preset !== undefined && tier.preset !== 'pnpm')
                throw new Error(`Unsupported preset: ${String(tier.preset)}`);
            return {
                name: String(tier.name ?? tier.preset ?? index),
                preset: tier.preset === 'pnpm' ? 'pnpm' : null,
                files: strings(tier.files ?? []),
                run: typeof tier.run === 'string' ? tier.run : null,
                env: environment(tier.env ?? {}),
                watch: strings(tier.watch ?? []),
            };
        }),
        seed: { run: seed.run, env: environment(seed.env ?? {}) },
        warm: strings(object(raw.warm).routes),
        paint: {
            selector: paint.selector,
            timeout: Number.parseInt(paint.within, 10) * 1000,
        },
    };
}

export function instanceId(worktree: string): string {
    return `ldenv_${createHash('sha256').update(worktree).digest('hex').slice(0, 16)}`;
}
export function diffSet(...outputs: string[]): string[] {
    return [
        ...new Set(
            outputs.flatMap((output) => output.split('\0').filter(Boolean)),
        ),
    ].sort();
}
export function matchingTiers(tiers: Tier[], files: string[]): Tier[] {
    return tiers.filter((tier) =>
        tier.preset === 'pnpm'
            ? files.some((file) =>
                  ['pnpm-lock.yaml', '.npmrc', 'pnpm-workspace.yaml'].includes(
                      file,
                  ),
              )
            : tier.files.some((glob) =>
                  files.some((file) => path.posix.matchesGlob(file, glob)),
              ),
    );
}
export async function selectParent(
    parents: Parent[],
    isAncestor: (sha: string) => Promise<boolean>,
    requested: string | null = null,
): Promise<Parent> {
    const candidates = parents
        .filter(
            (parent) =>
                parent.seedComplete &&
                (!requested || parent.sha.startsWith(requested)),
        )
        .sort((a, b) => b.builtAt.localeCompare(a.builtAt));
    if (requested && candidates.length > 1)
        throw new Error('Parent SHA is ambiguous');
    for (const parent of candidates) {
        if (await isAncestor(parent.sha)) return parent;
    }
    throw new Error(
        'No completed ancestor parent. Run ~/.ldenv/bin/ldenv parent build --ref HEAD (or up --build-parent).',
    );
}
export function instanceEnvironment(input: {
    base: Environment;
    recipe: Environment;
    local: Environment;
    shared: Environment;
    worktree: string;
    id: string;
    database: string;
    machine: Machine;
    ports: Ports;
}): Environment {
    const {
        base,
        recipe,
        local,
        shared,
        worktree,
        id,
        database,
        machine,
        ports,
    } = input;
    const env = { ...base, ...recipe, ...local, ...shared };
    delete env.PGWIRE_PORT;
    delete env.PGCONNECTIONURI;
    delete env.DATABASE_URL;
    return {
        ...env,
        LIGHTDASH_MODE: 'development',
        IS_PULL_REQUEST: 'false',
        ALLOW_MISSING_MIGRATIONS: 'false',
        AI_COPILOT_ENABLED: local.AI_COPILOT_ENABLED ?? 'false',
        APPS_RUNTIME_ENABLED: local.APPS_RUNTIME_ENABLED ?? 'false',
        CI: 'false',
        SCHEDULER_ENABLED: 'true',
        LDENV_TRACING: local.LDENV_TRACING ?? 'false',
        OTEL_SDK_DISABLED: local.LDENV_TRACING === 'true' ? 'false' : 'true',
        LDENV_STANDALONE_SCHEDULER: local.LDENV_STANDALONE_SCHEDULER ?? 'false',
        LD_INSTANCE_ID: id,
        PGHOST: '127.0.0.1',
        PGPORT: String(machine.pgPort),
        PGUSER: 'postgres',
        PGPASSWORD: 'password',
        PGDATABASE: database,
        LIGHTDASH_SECRET: machine.secret,
        LIGHTDASH_SECRET_FALLBACKS: '[]',
        RUDDERSTACK_ANALYTICS_DISABLED: 'true',
        PORT: String(ports.api),
        FE_PORT: String(ports.frontend),
        SCHEDULER_PORT: String(ports.scheduler),
        DEBUG_PORT: String(ports.debug),
        SDK_TEST_PORT: String(ports.sdkTest),
        MAPLE_PORT: String(ports.maple),
        MAPLE_LOCAL_URL: `http://127.0.0.1:${ports.maple}`,
        LIGHTDASH_PROMETHEUS_PORT: String(ports.prometheus),
        SITE_URL: `http://localhost:${ports.frontend}`,
        INTERNAL_LIGHTDASH_HOST: `http://localhost:${ports.frontend}`,
        LIGHTDASH_API_URL: `http://localhost:${ports.api}`,
        DBT_DEMO_DIR: path.join(worktree, 'examples/full-jaffle-shop-demo'),
        DBT_PROJECT_DIR: path.join(
            worktree,
            'examples/full-jaffle-shop-demo/dbt',
        ),
        LDPAT: 'ldpat_deadbeefdeadbeefdeadbeefdeadbeef',
    };
}
export function tierEnvironment(
    env: Environment,
    extra: Environment,
): Environment {
    return {
        ...env,
        ...extra,
        LIGHTDASH_LICENSE_KEY: env.LIGHTDASH_LICENSE_KEY,
        LIGHTDASH_SECRET: env.LIGHTDASH_SECRET,
        PGDATABASE: env.PGDATABASE,
        PGHOST: env.PGHOST,
        PGPORT: env.PGPORT,
        RUDDERSTACK_ANALYTICS_DISABLED: 'true',
    };
}
export function dotenvText(env: Environment): string {
    return (
        Object.entries(env)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => {
                if (!/^[A-Z][A-Z0-9_]*$/.test(key) || value.includes('\0'))
                    throw new Error(`Invalid environment key/value: ${key}`);
                if (!value.includes("'")) return `${key}='${value}'`;
                if (!/["\\\r\n]/.test(value)) return `${key}="${value}"`;
                throw new Error(`Cannot safely encode ${key} in dotenv`);
            })
            .join('\n') + '\n'
    );
}
export function assertInstance(instance: Instance): void {
    if (
        instance.id !== instanceId(instance.adoptedFrom ?? instance.worktree) ||
        instance.database !== `ld_${instance.id}` ||
        !path.isAbsolute(instance.worktree) ||
        !/^[a-f0-9]{40}$/.test(instance.parent)
    )
        throw new Error('Instance ownership record is invalid');
}

export function newInstance(
    root: string,
    parent: string,
    kind: Instance['kind'] = 'worktree',
): Instance {
    const id = instanceId(root);
    const now = new Date().toISOString();
    return {
        kind,
        id,
        worktree: root,
        parent,
        database: `ld_${id}`,
        ports: null,
        phase: 'preparing',
        createdAt: now,
        startedAt: now,
        updatedAt: now,
        timings: {},
        error: null,
        monitorPid: null,
        readyAt: null,
        verification: null,
    };
}

export function seedCommands(run: string): {
    warehouse: string;
    application: string;
} {
    const match = run.match(/^([\s\S]+)&&\s*(pnpm\s+-F\s+backend\s+seed)\s*$/);
    if (!match)
        throw new Error(
            'Expected the Rainbow seed recipe to end with pnpm -F backend seed',
        );
    return { warehouse: match[1].trim(), application: match[2] };
}

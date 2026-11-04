import { subject } from '@casl/ability';
import { type SessionUser } from '@lightdash/common';
import knex from 'knex';
import NodeCache from 'node-cache';

const entries = new Map<string, { cache: NodeCache; filledAt: number }>();
const originalSet = NodeCache.prototype.set;
NodeCache.prototype.set = function observeSet<T>(
    this: NodeCache,
    key: NodeCache.Key,
    value: T,
    ttl?: number | string,
) {
    const result = Reflect.apply(
        originalSet,
        this,
        ttl === undefined ? [key, value] : [key, value, ttl],
    );
    if (typeof key === 'string' && key.includes('::'))
        entries.set(key, {
            cache: this,
            filledAt:
                (this.getTtl(key) ?? 0) - (this.options.stdTTL ?? 0) * 1000,
        });
    return result;
};

const run = async () => {
    if (process.env.EXPERIMENTAL_CACHE !== 'true')
        throw new Error('The process must enable its real caches');
    const database = knex({
        client: 'pg',
        connection: process.env.AGENT_TEST_DATABASE_URI,
        pool: { min: 0, max: 3 },
    });
    let server:
        | Awaited<
              ReturnType<
                  typeof import('./agentConnectionHttpHarness.mock').startConnectionHttpServer
              >
          >
        | undefined;
    let closing = false;
    const close = async () => {
        if (closing) return;
        closing = true;
        const deadline = setTimeout(() => process.exit(1), 4000);
        try {
            try {
                await server?.close();
            } finally {
                await database.destroy();
            }
            process.exitCode = 0;
        } catch (error) {
            console.error(error);
            process.exitCode = 1;
        } finally {
            clearTimeout(deadline);
            process.exit(process.exitCode);
        }
    };
    process.on('disconnect', () => {
        void close();
    });
    process.on('SIGTERM', () => {
        void close();
    });
    process.on(
        'message',
        (message: {
            command: 'close' | 'cache';
            userUuid?: string;
            organizationUuid?: string;
            projectUuid?: string;
        }) => {
            if (message.command === 'close') {
                void close();
                return;
            }
            if (
                message.command === 'cache' &&
                message.userUuid &&
                message.organizationUuid &&
                message.projectUuid
            ) {
                const key = `${message.userUuid}::${message.organizationUuid}`;
                const entry = entries.get(key);
                const cached = entry?.cache.get<SessionUser>(key);
                process.send?.({
                    kind: 'cache',
                    hit: cached !== undefined,
                    active: cached?.isActive ?? null,
                    canViewProject:
                        cached?.ability.can(
                            'view',
                            subject('Project', {
                                organizationUuid: message.organizationUuid,
                                projectUuid: message.projectUuid,
                            }),
                        ) ?? null,
                    filledAt: entry?.filledAt ?? null,
                    expiresAt: entry?.cache.getTtl(key) ?? null,
                    ttlMs: (entry?.cache.options.stdTTL ?? 0) * 1000,
                });
            }
        },
    );
    try {
        const { startConnectionHttpServer } =
            await import('./agentConnectionHttpHarness.mock');
        server = await startConnectionHttpServer(database);
        const result = await database.raw('select pg_backend_pid() as pid');
        process.send?.({
            kind: 'ready',
            base: server.base,
            pid: process.pid,
            databasePid: result.rows[0].pid,
        });
    } catch (error) {
        await database.destroy();
        throw error;
    }
};
void run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});

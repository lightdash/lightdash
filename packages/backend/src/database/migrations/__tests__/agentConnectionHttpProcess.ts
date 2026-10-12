import knex from 'knex';
import { startConnectionHttpServer } from './agentConnectionHttpHarness';

const run = async () => {
    if (process.env.EXPERIMENTAL_CACHE !== 'true')
        throw new Error('The process must enable its real caches');
    const database = knex({
        client: 'pg',
        connection: process.env.AGENT_TEST_DATABASE_URI,
        pool: { min: 0, max: 3 },
    });
    const server = await startConnectionHttpServer(database);
    process.on(
        'message',
        async (message: {
            command: 'close' | 'cache';
            userUuid?: string;
            organizationUuid?: string;
        }) => {
            if (message.command === 'close') {
                await server.close();
                await database.destroy();
                process.exit(0);
            }
            if (
                message.command === 'cache' &&
                message.userUuid &&
                message.organizationUuid
            ) {
                const cached = await server.models
                    .getUserModel()
                    .getSessionUserFromCacheOrDB(
                        message.userUuid,
                        message.organizationUuid,
                    );
                process.send?.({
                    kind: 'cache',
                    hit: cached.cacheHit,
                    active: cached.sessionUser.isActive,
                });
            }
        },
    );
    process.on('disconnect', async () => {
        await server.close();
        await database.destroy();
        process.exit(0);
    });
    const result = await database.raw('select pg_backend_pid() as pid');
    process.send?.({
        kind: 'ready',
        base: server.base,
        pid: process.pid,
        databasePid: result.rows[0].pid,
    });
};
void run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});

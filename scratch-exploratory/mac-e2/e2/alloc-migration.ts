const main = async () => {
    const path = await import('node:path');
    const { createRequire } = await import('node:module');
    const require = createRequire(path.resolve(process.cwd(), 'packages/backend/package.json'));
    const knex = require('knex');
    const { up, down } = await import(path.resolve('scratch-exploratory/e2/.work/results/allocMigration.ts'));
    const { up: reserve, down: unreserve } = await import(path.resolve('scratch-exploratory/e2/.work/results/reserveMigration.ts'));
    const database = knex({client: 'pg', connection: {host: process.env.PGHOST, port: Number(process.env.PGPORT_APP || process.env.PGPORT), database: process.env.PGDATABASE_APP || process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD}});
    try {
        await database.transaction(async (transaction) => {
            if (process.argv[2] === 'down') {
                await unreserve(transaction);
                await down(transaction);
            } else {
                await up(transaction);
                await reserve(transaction);
            }
        });
    } finally {
        await database.destroy();
    }
};
void main();

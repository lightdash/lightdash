import { Knex } from 'knex';
import Logger from '../../logger';

const { makeWorkerUtils } = require('graphile-worker');

export async function up(knex: Knex): Promise<void> {
    try {
        const workerUtils = await makeWorkerUtils({});
        await workerUtils.migrate();
    } catch (e) {
        Logger.error('Unable to run migrations for graphile worker', e);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP SCHEMA graphile_worker CASCADE;`);
}

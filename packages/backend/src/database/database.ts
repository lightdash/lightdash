import knex from 'knex';
import * as knexfile from './knexfile';

const getKnexInstance = () => {
    const env = process.env.NODE_ENV || 'development';
    switch (env) {
        case 'production':
            return knexfile.production;
        case 'development':
        default:
            return knexfile.development;
    }
};

const database = knex(getKnexInstance());

export async function getMigrationStatus() {
    const migrationStatus = await database.migrate.status();
    const migrationCurrentVersion = await database.migrate.currentVersion();
    return {
        isComplete: migrationStatus === 0,
        currentVersion: migrationCurrentVersion,
    };
}

export default database;

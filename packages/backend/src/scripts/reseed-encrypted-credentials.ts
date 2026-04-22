/**
 * Re-encrypts warehouse credentials and dbt connection settings in the database.
 *
 * Used after creating a branch database from the template — the template's
 * encrypted blobs are tied to the LIGHTDASH_SECRET and PG* env vars that were
 * active when the template was seeded. This script overwrites them with values
 * encrypted using the current environment.
 */
import {
    DbtProjectType,
    SEED_PROJECT,
    WarehouseTypes,
} from '@lightdash/common';
import knex from 'knex';
import path from 'path';
import { lightdashConfig } from '../config/lightdashConfig';
import knexConfig from '../knexfile';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const enc = new EncryptionUtil({ lightdashConfig });

const demoDir = process.env.DBT_DEMO_DIR;
if (!demoDir) {
    throw new Error(
        'Must specify absolute path to demo project with DBT_DEMO_DIR',
    );
}

const pgHost = process.env.PGHOST;
const pgPort = parseInt(process.env.PGPORT || '', 10);
const pgUser = process.env.PGUSER;
const pgPassword = process.env.PGPASSWORD;
const pgDatabase = process.env.PGDATABASE;

if (!pgHost || Number.isNaN(pgPort) || !pgUser || !pgPassword || !pgDatabase) {
    throw new Error(
        'Must specify PGHOST, PGPORT, PGUSER, PGPASSWORD, and PGDATABASE',
    );
}

async function main() {
    const db = knex(
        knexConfig[
            (process.env.NODE_ENV as 'production' | 'development') ||
                'development'
        ],
    );

    try {
        const encryptedDbtConnection = enc.encrypt(
            JSON.stringify({
                type: DbtProjectType.DBT,
                project_dir: path.join(demoDir!, '/dbt'),
                profiles_dir: path.join(demoDir!, '/profiles'),
            }),
        );

        const updatedProjects = await db('projects')
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .update({ dbt_connection: encryptedDbtConnection });

        console.log(`Updated dbt_connection for ${updatedProjects} project(s)`);

        const encryptedWarehouseCreds = enc.encrypt(
            JSON.stringify({
                type: WarehouseTypes.POSTGRES,
                schema: 'jaffle',
                host: pgHost,
                port: pgPort,
                user: pgUser,
                password: pgPassword,
                dbname: pgDatabase,
                sslmode: 'disable',
            }),
        );

        const updatedCreds = await db('warehouse_credentials')
            .whereIn(
                'project_id',
                db('projects')
                    .select('project_id')
                    .where('project_uuid', SEED_PROJECT.project_uuid),
            )
            .update({ encrypted_credentials: encryptedWarehouseCreds });

        console.log(
            `Updated encrypted_credentials for ${updatedCreds} warehouse credential(s)`,
        );
    } finally {
        await db.destroy();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

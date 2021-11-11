import {
    CreatePostgresCredentials,
    DbtLocalProjectConfig,
    LightdashMode,
    ProjectType,
    SEED_PROJECT,
    SEED_SPACE,
    WarehouseTypes,
} from 'common';
import { Knex } from 'knex';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { EncryptionService } from '../../../services/EncryptionService/EncryptionService';

export async function seed(knex: Knex): Promise<void> {
    await knex('projects').del();

    const enc = new EncryptionService({ lightdashConfig });
    const projectSettings: DbtLocalProjectConfig = {
        type: ProjectType.DBT,
        project_dir: '/usr/app/dbt',
        profiles_dir: '/usr/app/profiles',
        name: 'default',
    };
    const encryptedProjectSettings = enc.encrypt(
        JSON.stringify(projectSettings),
    );

    await knex('projects').insert({
        ...SEED_PROJECT,
        dbt_connection: encryptedProjectSettings,
    });

    let encryptedCredentials: Buffer;
    if (
        lightdashConfig.mode === LightdashMode.DEMO ||
        lightdashConfig.mode === LightdashMode.PR
    ) {
        // Demo mode
        if (process.env.PGHOST === undefined) {
            throw new Error('Must specify PGHOST');
        }
        const port = parseInt(process.env.PGPORT || '', 10);
        if (Number.isNaN(port)) {
            throw new Error('Must specify a valid PGPORT');
        }
        if (process.env.PGPASSWORD === undefined) {
            throw new Error('Must specify PGPASSWORD');
        }
        if (process.env.PGUSER === undefined) {
            throw new Error('Must specify PGUSER in demo');
        }
        if (process.env.PGDATABASE === undefined) {
            throw new Error('Must specify PGDATABASE in demo');
        }
        const creds: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            schema: 'jaffle',
            host: process.env.PGHOST,
            port,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            dbname: process.env.PGDATABASE,
            sslmode: 'disable',
            threads: 8,
        };
        encryptedCredentials = enc.encrypt(JSON.stringify(creds));
    } else {
        // Dev mode
        encryptedCredentials = Buffer.from(
            'bd2b8a1f5c50106edc43aa886e9865c73b209f3afea54245dd4106f80d5318bab30789096d43f17310f664080a1d96adc230fd3093b9f5a85e1e975ed20c46c9928821f2de87d59b1ef0dbbae6fc332f11ffae7485e43e67e26efecc9ea9a984510b0e52032646bd925e4db0e45253332416c4bc332f16ad5269ffdd60d18d1cd178400153f7e64ca54fe408e059bd99ee79f8fcfdac066cd2a6d6a1ed15eca4ddfffa50254b1f0e2daa7615ccb1bffaeacf315641856eb4c0284012b5fc331a84ea3cbff7da85ed84e1005ab004b104d75b207723259055f83f62eae69eda1ccaeeecdf9d98226301d9c0a64c9313ec9cd127fd3dd11fc3925b8825b68a782870686c000cfc4703d8891b26',
            'hex',
        );
    }

    await knex('warehouse_credentials').insert({
        project_id: 1,
        encrypted_credentials: encryptedCredentials,
        warehouse_type: 'postgres',
    });

    await knex('spaces').insert(SEED_SPACE);
}

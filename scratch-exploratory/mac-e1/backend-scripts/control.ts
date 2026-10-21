import knex from 'knex';
import fs from 'node:fs';
import { lightdashConfig } from '../../config/lightdashConfig';
import config from '../../knexfile';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { WarehouseConnectionSwitchModel } from '../../models/WarehouseConnectionSwitchModel/WarehouseConnectionSwitchModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

async function main() {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const database = knex(config.development);
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const sourcesModel = new ProjectDbtSourcesModel({ database, encryptionUtil });
    if (input.action === 'multi-fixture') {
        const projectRow = await database('projects').where('project_uuid', input.project).first();
        const args = { database, encryptionUtil, organizationWarehouseCredentialsModel:
            new OrganizationWarehouseCredentialsModel({ database, encryptionUtil }) };
        const switchModel = new WarehouseConnectionSwitchModel(args);
        const connectionModel = new WarehouseConnectionModel(args);
        const original = await database('warehouse_connections').where({ project_uuid: input.project, is_original: true }).first();
        if (!original) {
            await switchModel.createOriginal({ projectUuid: input.project, name: 'Original local fixture',
                listAllDatabases: false, additionalDatabases: [], createdByUserUuid: projectRow.created_by_user_uuid });
        }
        await switchModel.setMultiMode(input.project);
        const project = await connectionModel.getProject(input.project);
        const created = await connectionModel.createExtra(project, {
            name: input.name, warehouseType: input.credentials.type,
            source: { kind: 'project', credentials: input.credentials },
            listAllDatabases: false, additionalDatabases: [], createdByUserUuid: projectRow.created_by_user_uuid,
        });
        console.log(JSON.stringify(created));
    }
    if (input.action === 'sources') {
        const primary = input.sources[0];
        await database('project_dbt_sources').where('project_uuid', input.project).delete();
        await database('projects').where('project_uuid', input.project).update({
            dbt_source_name: primary.name,
            dbt_connection_type: 'dbt',
            dbt_connection: encryptionUtil.encrypt(JSON.stringify(primary.connection)),
            dbt_version: input.version ?? 'v1.12',
        });
        for (const [index, source] of input.sources.slice(1).entries()) {
            await sourcesModel.createSource(input.project, {
                name: source.name,
                isPrimary: false,
                precedence: index + 1,
                dbtConnection: source.connection,
                warehouseLocation: { database: 'warehouse', schema: source.schema ?? 'public' },
            });
        }
        console.log(JSON.stringify({ sources: input.sources.map((source) => source.name) }));
    }
    if (input.action === 'sql') {
        const result = await database.raw(input.sql, input.bindings ?? []);
        console.log(JSON.stringify(result.rows));
    }
    await database.destroy();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});

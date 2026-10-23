import {
    DbtProjectType,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { type DbPeerDbtSource } from '../../../models/PeerDbtSourcesModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { allocateStagedExploreNames } from '../../../models/ProjectModel/exploreNameAllocation';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { WarehouseConnectionSwitchModel } from '../../../models/WarehouseConnectionSwitchModel/WarehouseConnectionSwitchModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

let migrated: MigratedDatabase;
let database: Knex;
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: lightdashConfigMock,
});

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    database = migrated.database;
});
afterAll(async () => migrated?.destroy());

const fixture = async () => {
    const [organization] = await database('organizations')
        .insert({ organization_name: 'role_fixture' })
        .returning('organization_id');
    const [project] = await database<{
        project_uuid: string;
        project_id: number;
        dbt_source_uuid: string;
        organization_id: number;
        name: string;
        connection_mode: string;
        dbt_connection_type: DbtProjectType;
    }>('projects')
        .insert({
            organization_id: organization.organization_id,
            name: 'project_a',
            connection_mode: 'multi',
            dbt_connection_type: DbtProjectType.NONE,
        })
        .returning(['project_uuid', 'project_id', 'dbt_source_uuid']);
    const [connection] = await database('warehouse_connections')
        .insert({
            project_uuid: project.project_uuid,
            name: 'connection_a',
            is_original: false,
            warehouse_type: 'postgres',
            encrypted_credentials: Buffer.from('unused'),
        })
        .returning('warehouse_connection_uuid');
    const sourceUuid = randomUUID();
    await database<DbPeerDbtSource>('project_dbt_sources').insert({
        project_dbt_source_uuid: sourceUuid,
        project_uuid: project.project_uuid,
        name: 'main_row',
        role: 'main',
        dbt_connection_type: DbtProjectType.NONE,
        dbt_connection: encryptionUtil.encrypt(
            JSON.stringify({ type: DbtProjectType.NONE }),
        ),
        warehouse_connection_uuid: connection.warehouse_connection_uuid,
    });
    return {
        project,
        sourceUuid,
        connectionUuid: connection.warehouse_connection_uuid,
    };
};

test('ignores main rows in extra warehouse bindings, bound content and switch counts', async () => {
    const { project, sourceUuid, connectionUuid } = await fixture();
    const bindings = new WarehouseConnectionCompileModel({ database });
    expect(
        (await bindings.getDbtSourceBindings(project.project_uuid)).sources,
    ).toEqual([]);
    await expect(
        bindings.bindDbtSource(project.project_uuid, sourceUuid, null),
    ).rejects.toBeInstanceOf(NotFoundError);
    const organizationWarehouseCredentialsModel =
        new OrganizationWarehouseCredentialsModel({ database, encryptionUtil });
    const connectionModel = new WarehouseConnectionModel({
        database,
        encryptionUtil,
        organizationWarehouseCredentialsModel,
    });
    expect(
        (await connectionModel.getBoundContent(connectionUuid)).dbtSources,
    ).toEqual([]);
    const switchModel = new WarehouseConnectionSwitchModel({
        database,
        encryptionUtil,
        organizationWarehouseCredentialsModel,
    });
    expect(
        (
            await switchModel.getContentCounts({
                projectUuid: project.project_uuid,
                projectId: project.project_id,
            })
        ).dbtSources,
    ).toBe(1);
    expect(
        (
            await database<DbPeerDbtSource>('project_dbt_sources')
                .where('project_dbt_source_uuid', sourceUuid)
                .first()
        )?.warehouse_connection_uuid,
    ).toBe(connectionUuid);
});

test('ignores main rows in source collectors, copies and UUID lookups with the flag off', async () => {
    const { project, sourceUuid } = await fixture();
    const target = await fixture();
    const sources = new ProjectDbtSourcesModel({ database, encryptionUtil });
    expect(await sources.hasSources(project.project_uuid)).toBe(false);
    expect(await sources.getSources(project.project_uuid)).toEqual([]);
    expect(await sources.getSourcesWithBindings(project.project_uuid)).toEqual(
        [],
    );
    await expect(sources.getSource(sourceUuid)).rejects.toBeInstanceOf(
        NotFoundError,
    );
    await sources.copySources(
        project.project_uuid,
        target.project.project_uuid,
    );
    expect(await sources.getSources(target.project.project_uuid)).toEqual([]);
    expect(
        await database<DbPeerDbtSource>('project_dbt_sources').where(
            'project_uuid',
            target.project.project_uuid,
        ),
    ).toHaveLength(1);
});

test('ignores main rows in extra-source routing and explore name allocation', async () => {
    const { project, sourceUuid } = await fixture();
    const model = new ProjectModel({
        database,
        encryptionUtil,
        lightdashConfig: lightdashConfigMock,
    });
    await expect(
        model.getDbtSourceWarehouseType(project.project_uuid, sourceUuid),
    ).rejects.toBeInstanceOf(ParameterError);
    const allocated = await database.transaction((trx) =>
        allocateStagedExploreNames(trx, project.project_uuid, randomUUID(), {
            mode: 'refresh',
            models: [],
            refreshedSourceUuids: [],
            warnings: [],
        }),
    );
    expect(allocated.activeSourceUuids).toEqual([project.dbt_source_uuid]);
});

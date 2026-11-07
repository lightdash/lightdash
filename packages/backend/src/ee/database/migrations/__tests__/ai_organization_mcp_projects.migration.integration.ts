import { ProjectType, SupportedDbtVersions } from '@lightdash/common';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../../utils/EncryptionUtil/EncryptionUtil';
import { AiOrganizationSettingsModel } from '../../../models/AiOrganizationSettingsModel';
import { down, up } from '../20261028120000_add_mcp_project_access';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

it('defaults to all, atomically replaces selected projects and rolls back failed replacements', async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'MCP project access test' })
        .returning('*');
    const projects = await database('projects')
        .insert(
            ['A', 'B'].map((name) => ({
                name,
                organization_id: org.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                dbt_version: SupportedDbtVersions.V1_7,
                copied_from_project_uuid: null,
                created_by_user_uuid: null,
                organization_warehouse_credentials_uuid: null,
            })),
        )
        .returning('*');
    const model = new AiOrganizationSettingsModel({
        database,
        encryptionUtil: new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        }),
    });
    expect(await model.getMcpProjectAccess(org.organization_uuid)).toEqual({
        mode: 'all',
    });
    await model.upsert(org.organization_uuid, {
        mcpProjectAccess: {
            mode: 'selected',
            projectUuids: projects.map((p) => p.project_uuid),
        },
    });
    await model.upsert(org.organization_uuid, {
        mcpProjectAccess: {
            mode: 'selected',
            projectUuids: [projects[1].project_uuid],
        },
    });
    expect(await model.getMcpProjectAccess(org.organization_uuid)).toEqual({
        mode: 'selected',
        projectUuids: [projects[1].project_uuid],
    });
    await expect(
        model.upsert(org.organization_uuid, {
            mcpEnabled: false,
            mcpProjectAccess: {
                mode: 'selected',
                projectUuids: ['00000000-0000-0000-0000-000000000000'],
            },
        }),
    ).rejects.toThrow();
    expect(await model.findMcpEnabled(org.organization_uuid)).toBe(true);
    expect(await model.getMcpProjectAccess(org.organization_uuid)).toEqual({
        mode: 'selected',
        projectUuids: [projects[1].project_uuid],
    });
    await database('projects')
        .where('project_uuid', projects[1].project_uuid)
        .delete();
    expect(await model.getMcpProjectAccess(org.organization_uuid)).toEqual({
        mode: 'selected',
        projectUuids: [],
    });
    await model.upsert(org.organization_uuid, {
        mcpProjectAccess: { mode: 'all' },
    });
    expect(
        await database('ai_organization_mcp_projects').where(
            'organization_uuid',
            org.organization_uuid,
        ),
    ).toEqual([]);
    await model.upsert(org.organization_uuid, {
        mcpProjectAccess: {
            mode: 'selected',
            projectUuids: [projects[0].project_uuid],
        },
    });
    await database('organizations')
        .where('organization_uuid', org.organization_uuid)
        .delete();
    expect(
        await database('ai_organization_mcp_projects').where(
            'organization_uuid',
            org.organization_uuid,
        ),
    ).toEqual([]);
});

it('has an additive default, a mode constraint, cascade indexes and a real reversal', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [org] = await trx('organizations')
            .insert({ organization_name: 'MCP project upgrade test' })
            .returning('*');
        await trx('ai_organization_settings').insert({
            organization_uuid: org.organization_uuid,
        });
        await up(trx);
        expect(
            await trx('ai_organization_settings')
                .where('organization_uuid', org.organization_uuid)
                .first(),
        ).toMatchObject({ mcp_project_access_mode: 'all' });
        await expect(
            trx.transaction(async (nested) => {
                await nested('ai_organization_settings')
                    .where('organization_uuid', org.organization_uuid)
                    .update({ mcp_project_access_mode: 'invalid' });
            }),
        ).rejects.toThrow();
        const indexes = await trx<{ indexdef: string }>('pg_indexes')
            .select('indexdef')
            .where('tablename', 'ai_organization_mcp_projects');
        expect(
            indexes.some((index) => index.indexdef.endsWith('(project_uuid)')),
        ).toBe(true);
        await down(trx);
        expect(
            await trx.schema.hasColumn(
                'ai_organization_settings',
                'mcp_project_access_mode',
            ),
        ).toBe(false);
        expect(await trx.schema.hasTable('ai_organization_mcp_projects')).toBe(
            false,
        );
        await up(trx);
    });
});

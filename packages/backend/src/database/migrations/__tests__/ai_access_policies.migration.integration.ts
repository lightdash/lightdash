import { AiPrincipalKind, AiTransportKind } from '@lightdash/common';
import { AiAccessPolicyModel } from '../../../models/AiAccessPolicyModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261006210000_add_ai_principals';

describe('AI access person policy schema', () => {
    let migrated: MigratedDatabase;
    beforeAll(async () => {
        migrated = await createMigratedDatabase();
    }, 600000);
    afterAll(async () => migrated?.destroy());

    test('creates only the person policy table and reverses cleanly', async () => {
        const { database } = migrated;
        expect(await database.schema.hasTable('ai_principals')).toBe(false);
        expect(
            await database.schema.hasTable('ai_principal_group_mappings'),
        ).toBe(false);
        const columns = await database('information_schema.columns')
            .where({ table_schema: 'public', table_name: 'ai_access_policies' })
            .pluck('column_name');
        expect(columns.sort()).toEqual(
            [
                'ai_access_policy_uuid',
                'project_uuid',
                'warehouse_connection_uuid',
                'enabled',
                'principal_kind',
                'transport',
                'created_at',
                'updated_at',
            ].sort(),
        );
        await database.transaction(async (trx) => {
            await down(trx);
            expect(await trx.schema.hasTable('ai_access_policies')).toBe(false);
            await up(trx);
        });
        expect(await database.schema.hasTable('ai_access_policies')).toBe(true);
    });

    test('keeps policies isolated by connection and upserts without principal tables', async () => {
        const { database } = migrated;
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Policy test' })
            .returning('organization_id');
        const {
            rows: [project],
        } = await database.raw<{ rows: { project_uuid: string }[] }>(
            "INSERT INTO projects (name, organization_id) VALUES ('Policy test', ?) RETURNING project_uuid",
            [organization.organization_id],
        );
        const [connection] = await database('warehouse_connections')
            .insert({
                project_uuid: project.project_uuid,
                name: 'Original',
                is_original: true,
            })
            .returning('warehouse_connection_uuid');
        const model = new AiAccessPolicyModel({ database });
        const policy = {
            enabled: true,
            principalKind: AiPrincipalKind.PERSON,
            transport: { kind: AiTransportKind.DIRECT },
        };
        const original = await model.upsertPolicy(
            project.project_uuid,
            null,
            policy,
        );
        const extra = await model.upsertPolicy(
            project.project_uuid,
            connection.warehouse_connection_uuid,
            policy,
        );
        expect(original.aiAccessPolicyUuid).not.toBe(extra.aiAccessPolicyUuid);
        expect(
            await model.upsertPolicy(project.project_uuid, null, {
                ...policy,
                enabled: false,
            }),
        ).toMatchObject({
            aiAccessPolicyUuid: original.aiAccessPolicyUuid,
            enabled: false,
        });
        expect(
            await model.findPolicy(
                project.project_uuid,
                connection.warehouse_connection_uuid,
            ),
        ).toMatchObject({
            aiAccessPolicyUuid: extra.aiAccessPolicyUuid,
            enabled: true,
        });
        await expect(
            database.raw(
                "UPDATE ai_access_policies SET principal_kind = 'shared' WHERE ai_access_policy_uuid = ?",
                [original.aiAccessPolicyUuid],
            ),
        ).rejects.toMatchObject({ code: '23514' });
        await database('projects')
            .where('project_uuid', project.project_uuid)
            .delete();
        expect(await model.findPolicy(project.project_uuid, null)).toBeNull();
    });
});

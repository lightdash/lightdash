import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261011000004_add_agent_policy_allowed_groups';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('adds a nullable UUID array to existing policies and reverses it', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Admission migration' })
            .returning('organization_uuid');
        await trx('organization_agent_capability_policies').insert({
            organization_uuid: org.organization_uuid,
        } as never);
        await up(trx);
        const column = await trx('information_schema.columns')
            .where({
                table_name: 'organization_agent_capability_policies',
                column_name: 'allowed_group_uuids',
            })
            .first();
        expect(column).toMatchObject({
            is_nullable: 'YES',
            data_type: 'ARRAY',
            udt_name: '_uuid',
        });
        const policy = await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .first();
        expect(policy?.allowed_group_uuids).toBeNull();
        await trx('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid)
            .update({ allowed_group_uuids: [] });
        expect(
            (
                await trx('organization_agent_capability_policies')
                    .where('organization_uuid', org.organization_uuid)
                    .first()
            )?.allowed_group_uuids,
        ).toEqual([]);
        await down(trx);
        expect(
            await trx.schema.hasColumn(
                'organization_agent_capability_policies',
                'allowed_group_uuids',
            ),
        ).toBe(false);
        await up(trx);
    });
});

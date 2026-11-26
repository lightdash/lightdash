import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261126120000_align_agent_policy_capabilities_with_mode';

const TABLE = 'organization_agent_capability_policies';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

test('makes the saved capability list match each policy mode', async () => {
    await migrated.database.transaction(async (trx) => {
        const cases = [
            { mode: 'managed', before: null, after: 11 },
            { mode: 'managed', before: ['query'], after: 1 },
            { mode: 'managed', before: [], after: 0 },
            { mode: 'legacy', before: ['query'], after: null },
            { mode: 'legacy', before: null, after: null },
        ];
        const organizations = await trx('organizations')
            .insert(
                cases.map((_, index) => ({
                    organization_name: `Agent policy ${index}`,
                })),
            )
            .returning('organization_uuid');
        await trx(TABLE).insert(
            cases.map(({ mode, before }, index) => ({
                organization_uuid: organizations[index].organization_uuid,
                mode,
                version: 1,
                allowed_capabilities: before,
            })) as never,
        );

        await up(trx);

        const rows = await trx(TABLE).whereIn(
            'organization_uuid',
            organizations.map((org) => org.organization_uuid),
        );
        const lengths = organizations.map(({ organization_uuid }) => {
            const row = rows.find(
                (candidate) =>
                    candidate.organization_uuid === organization_uuid,
            );
            return row?.allowed_capabilities?.length ?? null;
        });
        expect(lengths).toEqual(cases.map(({ after }) => after));
    });
});

test('cannot be reversed', async () => {
    await expect(down()).rejects.toThrow(/^irreversible:/);
});

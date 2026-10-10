import {
    AgentCapability,
    OrganizationMemberRole,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261011000000_add_agent_capability_policies';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const matrix = (capability: AgentCapability): AgentSystemRoleMatrix => ({
    member: [],
    viewer: [capability],
    interactive_viewer: [],
    editor: [],
    developer: [],
    admin: [],
});

test('backfills exactly four default scopes for every custom role, including empty roles, and keeps existing grants', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [org] = await trx('organizations')
            .insert({ organization_name: 'Capability migration' })
            .returning('organization_uuid');
        const [user] = await trx('users')
            .insert({ first_name: 'Capability', last_name: 'Admin' } as never)
            .returning('user_uuid');
        const roles = await trx('roles')
            .insert(
                ['Populated', 'Empty'].map((name) => ({
                    organization_uuid: org.organization_uuid,
                    name,
                    description: null,
                    level: 'project' as const,
                    created_by: user.user_uuid,
                })),
            )
            .returning('role_uuid');
        await trx('scoped_roles').insert([
            {
                role_uuid: roles[0].role_uuid,
                scope_name: 'view:AgentQuery',
                granted_by: user.user_uuid,
            },
            {
                role_uuid: roles[0].role_uuid,
                scope_name: 'view:Dashboard',
                granted_by: user.user_uuid,
            },
        ]);
        await up(trx);
        await Promise.all(
            roles.map(async (role) => {
                const rows = await trx('scoped_roles')
                    .where('role_uuid', role.role_uuid)
                    .where('scope_name', 'like', 'view:Agent%');
                expect(rows.map((row) => row.scope_name).sort()).toEqual([
                    'view:AgentExport',
                    'view:AgentQuery',
                    'view:AgentRawSql',
                    'view:AgentReadDiscover',
                ]);
                expect(
                    rows.every((row) => row.granted_by === user.user_uuid),
                ).toBe(true);
            }),
        );
        expect(
            await trx('scoped_roles').where({
                role_uuid: roles[0].role_uuid,
                scope_name: 'view:Dashboard',
            }),
        ).toHaveLength(1);
    });
});

test('serializes concurrent policy saves and replaces the entire grant matrix', async () => {
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Concurrent capability policy' })
        .returning('organization_uuid');
    const model = new AgentCapabilityPolicyModel({
        database: migrated.database,
    });
    const policies = await Promise.all(
        [AgentCapability.Query, AgentCapability.Export].map((capability) =>
            model.save({
                organizationUuid: org.organization_uuid,
                mode: 'managed',
                allowedProjectUuids: [],
                systemRoleMatrix: matrix(capability),
                updatedByUserUuid: null,
            }),
        ),
    );
    expect(policies.map((policy) => policy.version).sort()).toEqual([1, 2]);
    const current = await model.get(org.organization_uuid);
    expect(current).toEqual(policies.find((policy) => policy.version === 2));
    expect(
        current.systemRoleMatrix[OrganizationMemberRole.VIEWER],
    ).toHaveLength(1);
    await migrated
        .database('organizations')
        .where('organization_uuid', org.organization_uuid)
        .delete();
    expect(
        await migrated
            .database('organization_agent_capability_policies')
            .where('organization_uuid', org.organization_uuid),
    ).toEqual([]);
    expect(
        await migrated
            .database('organization_agent_system_role_capabilities')
            .where('organization_uuid', org.organization_uuid),
    ).toEqual([]);
});

test('rolls the policy version and project limit back when the grant replacement fails', async () => {
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Atomic capability policy' })
        .returning('organization_uuid');
    const model = new AgentCapabilityPolicyModel({
        database: migrated.database,
    });
    const original = await model.save({
        organizationUuid: org.organization_uuid,
        mode: 'managed',
        allowedProjectUuids: null,
        systemRoleMatrix: matrix(AgentCapability.Query),
        updatedByUserUuid: null,
    });
    await expect(
        model.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            allowedProjectUuids: [],
            systemRoleMatrix: matrix('invalid' as AgentCapability),
            updatedByUserUuid: null,
        }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await model.get(org.organization_uuid)).toEqual(original);
});

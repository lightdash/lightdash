import { Ability } from '@casl/ability';
import {
    AgentCapability,
    OrganizationMemberRole,
    ParameterError,
    type AgentSystemRoleMatrix,
    type PossibleAbilities,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import { AgentPermissionService } from '../../../services/AgentPermissionService/AgentPermissionService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261011000000_add_agent_capability_policies';
import { up as upAllowedUsers } from '../20261011000001_add_agent_policy_allowed_users';

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
        await upAllowedUsers(trx);
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
                allowedUserUuids: null,
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
        allowedUserUuids: null,
        allowedProjectUuids: null,
        systemRoleMatrix: matrix(AgentCapability.Query),
        updatedByUserUuid: null,
    });
    await expect(
        model.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            allowedUserUuids: null,
            allowedProjectUuids: [],
            systemRoleMatrix: matrix('invalid' as AgentCapability),
            updatedByUserUuid: null,
        }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await model.get(org.organization_uuid)).toEqual(original);
});

test.each([0, 1])(
    'only one concurrent save from version %i succeeds',
    async (version) => {
        const [org] = await migrated
            .database('organizations')
            .insert({ organization_name: 'Versioned policy' })
            .returning('organization_uuid');
        const model = new AgentCapabilityPolicyModel({
            database: migrated.database,
        });
        const input = {
            organizationUuid: org.organization_uuid,
            mode: 'managed' as const,
            allowedUserUuids: null,
            allowedProjectUuids: null,
            systemRoleMatrix: matrix(AgentCapability.Query),
            updatedByUserUuid: null,
        };
        if (version === 1) await model.save(input);
        const results = await Promise.allSettled(
            [AgentCapability.Query, AgentCapability.Export].map((capability) =>
                model.save({
                    ...input,
                    version,
                    systemRoleMatrix: matrix(capability),
                }),
            ),
        );
        const successes = results.filter(
            (result) => result.status === 'fulfilled',
        );
        expect(successes).toHaveLength(1);
        expect(
            results.find((result) => result.status === 'rejected'),
        ).toMatchObject({ reason: expect.any(ParameterError) });
        expect(await model.get(org.organization_uuid)).toEqual(
            successes[0].value,
        );
    },
);

test('departed pilot members do not block a matrix edit or reset to legacy', async () => {
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Departed pilot member' })
        .returning('*');
    const [user] = await migrated
        .database('users')
        .insert({ first_name: 'Pilot', last_name: 'Member' } as never)
        .returning('*');
    await migrated.database('organization_memberships').insert({
        organization_id: org.organization_id,
        user_id: user.user_id,
        role: OrganizationMemberRole.ADMIN,
    });
    const model = new AgentCapabilityPolicyModel({
        database: migrated.database,
    });
    await model.save({
        organizationUuid: org.organization_uuid,
        mode: 'managed',
        allowedUserUuids: [user.user_uuid],
        allowedProjectUuids: null,
        systemRoleMatrix: matrix(AgentCapability.Query),
        updatedByUserUuid: null,
    });
    await migrated
        .database('organization_memberships')
        .where({ organization_id: org.organization_id, user_id: user.user_id })
        .delete();
    const current = await model.get(org.organization_uuid);
    expect(current.allowedUserUuids).toEqual([]);
    const account = buildAccount();
    account.organization.organizationUuid = org.organization_uuid;
    account.user.id = user.user_uuid;
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const service = new AgentPermissionService({
        agentCapabilityPolicyModel: model,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        resolveResourceProjectUuid: vi.fn(),
        isCustomRolesLicensed: () => true,
        agentWarehouseRestrictionConfirmationModel: {
            get: vi.fn(),
            upsert: vi.fn(),
            delete: vi.fn(),
            getCurrentBindingFingerprint: vi.fn(),
        },
        userModel: { getAgentRoleAssignments: vi.fn() },
        projectModel: { getSummary: vi.fn() },
        getOrganizationSettings: vi.fn(),
        agentActionLogModel: { insert: vi.fn() },
    });
    expect(await service.resetToLegacy(account, current.version)).toMatchObject(
        {
            mode: 'legacy',
            allowedUserUuids: [],
        },
    );
    const latest = await model.get(org.organization_uuid);
    expect(
        await service.saveCeiling(account, {
            ...latest,
            systemRoleMatrix: matrix(AgentCapability.Export),
        }),
    ).toMatchObject({
        mode: 'managed',
        allowedUserUuids: [],
        systemRoleMatrix: matrix(AgentCapability.Export),
    });
    const beforeStaleReset = await model.get(org.organization_uuid);
    await expect(
        service.resetToLegacy(account, current.version),
    ).rejects.toThrow('Agent permissions changed.');
    expect(await model.get(org.organization_uuid)).toEqual(beforeStaleReset);
    await expect(
        service.saveCeiling(account, {
            ...(await model.get(org.organization_uuid)),
            allowedUserUuids: [user.user_uuid],
        }),
    ).rejects.toThrow('All allowed users must belong to this organization');
});

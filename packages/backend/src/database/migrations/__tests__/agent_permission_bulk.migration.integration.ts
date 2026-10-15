import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    AGENT_CAPABILITY_SCOPES,
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusedError,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import { AgentConnectionService } from '../../../auth/agentConnectionGrants/AgentConnectionService';
import {
    GRANT_OPERATION_CONTRACTS,
    supportsAgentConnectionCapability,
} from '../../../auth/agentConnectionGrants/operationContracts';
import { personAllowsAgentCapability } from '../../../auth/agentConnectionGrants/personAllowsAgentCapability';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import { AgentConnectionApprovalReadModel } from '../../../models/AgentConnectionApprovalReadModel';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../../models/UserModel';
import { AgentConnectionApprovalService } from '../../../services/AgentConnectionApprovalService/AgentConnectionApprovalService';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { type DbAgentConnectionApprovalRequest } from '../../entities/agentConnectionApprovalRequests';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async (customRolesEnabled = false) => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Bulk permissions' })
        .returning('*');
    const people = await Promise.all(
        [
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.DEVELOPER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.VIEWER,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.MEMBER,
        ].map(async (role, index) => {
            const [user] = await database('users')
                .insert({
                    first_name: `Person ${index}`,
                    last_name: 'Bulk',
                    is_marketing_opted_in: false,
                    is_tracking_anonymized: true,
                    is_setup_complete: true,
                    is_active: true,
                })
                .returning('*');
            await database('organization_memberships').insert({
                organization_id: org.organization_id,
                user_id: user.user_id,
                role,
            });
            await database('emails').insert({
                user_id: user.user_id,
                email: `${user.user_uuid}@example.com`,
                is_primary: true,
            });
            return user;
        }),
    );
    const projects = await database('projects')
        .insert(
            Array.from({ length: 50 }, (_, index) => ({
                organization_id: org.organization_id,
                name: `Project ${index}`,
                project_type: ProjectType.DEFAULT,
                created_by_user_uuid: people[0].user_uuid,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: '1.7',
                organization_warehouse_credentials_uuid: null,
            })),
        )
        .returning('*');
    const [custom] = await database('roles')
        .insert({
            name: 'Query only',
            description: null,
            level: 'project',
            organization_uuid: org.organization_uuid,
            created_by: people[0].user_uuid,
        })
        .returning('*');
    await database('scoped_roles').insert({
        role_uuid: custom.role_uuid,
        scope_name: AGENT_CAPABILITY_SCOPES[AgentCapability.Query],
        granted_by: people[0].user_uuid,
    });
    const [group] = await database('groups')
        .insert({
            organization_id: org.organization_id,
            name: 'Deploy group',
            created_by_user_uuid: people[0].user_uuid,
            updated_by_user_uuid: people[0].user_uuid,
        })
        .returning('*');
    await database('group_memberships').insert({
        group_uuid: group.group_uuid,
        user_id: people[7].user_id,
        organization_id: org.organization_id,
    });
    await database('project_memberships').insert(
        projects.flatMap((project, index) => [
            {
                project_id: project.project_id,
                user_id: people[5].user_id,
                role:
                    index % 2 === 0
                        ? ProjectMemberRole.VIEWER
                        : ProjectMemberRole.DEVELOPER,
                role_uuid: null,
            },
            {
                project_id: project.project_id,
                user_id: people[6].user_id,
                role: ProjectMemberRole.VIEWER,
                role_uuid: custom.role_uuid,
            },
        ]),
    );
    await database('project_group_access').insert(
        projects.map((project, index) => ({
            project_uuid: project.project_uuid,
            group_uuid: group.group_uuid,
            role:
                index % 2 === 0
                    ? ProjectMemberRole.DEVELOPER
                    : ProjectMemberRole.VIEWER,
        })),
    );
    await database('project_group_access_custom_roles').insert({
        project_uuid: projects[2].project_uuid,
        group_uuid: group.group_uuid,
        role_uuid: custom.role_uuid,
    });
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig: lightdashConfigMock,
    });
    const users = new UserModel({
        database,
        lightdashConfig: {
            ...lightdashConfigMock,
            customRoles: { enabled: customRolesEnabled },
        },
        featureFlagModel,
    });
    const projectModel = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil,
    });
    const policies = new AgentCapabilityPolicyModel({ database });
    const roleMatrix = {
        ...agentSystemRoleMatrix([]),
        admin: Object.values(AgentCapability),
        developer: [
            AgentCapability.DeployUpload,
            AgentCapability.ReadDiscover,
            AgentCapability.Administration,
        ],
        editor: [
            AgentCapability.ContentWrite,
            AgentCapability.Publish,
            AgentCapability.Delete,
        ],
        interactive_viewer: [AgentCapability.RawSql],
        viewer: [AgentCapability.Query],
    };
    const savePolicy = (
        overrides: Partial<Parameters<typeof policies.save>[0]> = {},
    ) =>
        policies.save({
            organizationUuid: org.organization_uuid,
            mode: 'managed',
            allowedCapabilities: [...AGENT_CAPABILITY_LIMIT_DEFAULTS],
            allowedGroupUuids: null,
            systemRoleMatrix: roleMatrix,
            updatedByUserUuid: people[0].user_uuid,
            ...overrides,
        });
    await savePolicy();
    const flags = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: true,
        })),
    };
    const service = new AgentPermissionService({
        resolveResourceProjectUuid: async () => null,
        isCustomRolesLicensed: () => true,
        areGroupsAvailable: async () => true,
        featureFlagModel: flags,
        groupsModel: new GroupsModel({ database }),
        agentCapabilityPolicyModel: policies,
        userModel: users,
        projectModel,
        agentActionLogModel: new AgentActionLogModel({ database }),
    });
    const accounts = await Promise.all(
        people.map(async (person) =>
            fromSession(
                await users.findSessionUserAndOrgByUuid(
                    person.user_uuid,
                    org.organization_uuid,
                ),
                '',
            ),
        ),
    );
    return {
        database,
        org,
        people,
        projects,
        custom,
        group,
        service,
        accounts,
        loaders: { userModel: users, projectModel },
        savePolicy,
        roleMatrix,
        flags,
        users,
        projectModel,
    };
};

const capabilities = Object.values(AgentCapability).map((key) => ({
    kind: 'capability' as const,
    key,
}));
const operations = Object.keys(GRANT_OPERATION_CONTRACTS).map((key) => ({
    kind: 'rest_operation' as const,
    key,
}));
const refusal = async (call: Promise<void>) => {
    try {
        await call;
        return null;
    } catch (error) {
        if (!(error instanceof AiAccessRefusedError)) throw error;
        return {
            reason: error.refusal.reason,
            capability: error.refusal.capability ?? null,
            policyLayer: error.refusal.policyLayer,
        };
    }
};

const forEachSequential = <T>(
    items: readonly T[],
    fn: (item: T) => Promise<void>,
): Promise<void> =>
    items.reduce(async (previous, item) => {
        await previous;
        await fn(item);
    }, Promise.resolve());

it('matches both operation paths cell by cell with real roles and policies', async () => {
    const f = await fixture();
    const scenarios = [
        'normal',
        'managed-defaults',
        'disabled',
        'capability-limited',
        'role-limited',
        'group-limited',
        'historical-null',
        'legacy',
        'legacy-group-limited',
        'off',
    ] as const;
    let cells = 0;
    await forEachSequential(scenarios, async (scenario) => {
        f.flags.get.mockImplementation(async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: scenario !== 'off',
        }));
        let systemRoleMatrix = f.roleMatrix;
        if (scenario === 'role-limited')
            systemRoleMatrix = agentSystemRoleMatrix([]);
        if (scenario === 'managed-defaults')
            systemRoleMatrix = agentSystemRoleMatrix(
                AGENT_CAPABILITY_LIMIT_DEFAULTS,
            );
        await f.savePolicy({
            mode: scenario.startsWith('legacy') ? 'legacy' : 'managed',
            allowedCapabilities:
                scenario === 'disabled'
                    ? []
                    : AGENT_CAPABILITY_LIMIT_DEFAULTS.filter(
                          (capability) =>
                              scenario !== 'capability-limited' ||
                              capability !== AgentCapability.Query,
                      ),
            allowedGroupUuids:
                scenario === 'group-limited' ||
                scenario === 'legacy-group-limited'
                    ? [f.group.group_uuid]
                    : null,
            systemRoleMatrix,
        });
        if (scenario === 'historical-null')
            await f
                .database('organization_agent_capability_policies')
                .where('organization_uuid', f.org.organization_uuid)
                .update({ allowed_capabilities: null });
        await forEachSequential(f.accounts, async (account) => {
            const checks = f.projects.slice(0, 3).flatMap((project) =>
                [
                    ...capabilities,
                    ...(scenario === 'normal' ? operations : []),
                ].map((op) => ({
                    ...op,
                    projectUuid: project.project_uuid,
                })),
            );
            const base = {
                account,
                organizationUuid: f.org.organization_uuid,
                surface: AgentActorSurface.CLI,
            };
            const bulk = await f.service.evaluateOperations(
                {
                    ...base,
                    operations: checks,
                },
                f.loaders,
            );
            expect(bulk).toHaveLength(checks.length);
            const request = await f.service.loadRequest(
                f.org.organization_uuid,
            );
            await forEachSequential(
                [...checks.entries()],
                async ([index, check]) => {
                    const expected = await refusal(
                        f.service.assertOperationWithRequest({
                            request,
                            operation: { ...base, ...check },
                        }),
                    );
                    const actual = bulk[index];
                    const cell = `${scenario}/${account.user.id}/${check.projectUuid}/${check.key}`;
                    expect({
                        cell,
                        refusal:
                            actual === null
                                ? null
                                : {
                                      reason: actual.reason,
                                      capability: actual.capability,
                                      policyLayer: actual.policyLayer,
                                  },
                    }).toEqual({ cell, refusal: expected });
                    expect(
                        await refusal(
                            f.service.assertOperation({ ...base, ...check }),
                        ),
                    ).toEqual(expected);
                    if (
                        check.kind === 'capability' &&
                        check.key === AgentCapability.Query &&
                        [f.accounts[4].user.id, f.accounts[6].user.id].includes(
                            account.user.id,
                        )
                    ) {
                        if (scenario === 'capability-limited')
                            expect(actual).toMatchObject({
                                reason: 'agent_capability_denied',
                                capability: AgentCapability.Query,
                                policyLayer: 'organization_setting',
                            });
                        if (
                            scenario === 'normal' ||
                            scenario === 'historical-null' ||
                            (scenario === 'role-limited' &&
                                account.user.id === f.accounts[6].user.id)
                        )
                            expect(actual).toBeNull();
                    }
                    cells += 1;
                },
            );
        });
    });
    expect(cells).toBe(
        9 * 3 * (scenarios.length * capabilities.length + operations.length),
    );
});

it('keeps role, policy, group and project query counts constant for 3 and 50 differentiated projects', async () => {
    const f = await fixture();
    await f.savePolicy({ allowedGroupUuids: [f.group.group_uuid] });
    const count = async (size: number) => {
        const sql: string[] = [];
        const listener = (query: { sql: string }) => sql.push(query.sql);
        f.database.on('query', listener);
        try {
            const result = await f.service.evaluateOperations(
                {
                    account: f.accounts[7],
                    organizationUuid: f.org.organization_uuid,
                    surface: AgentActorSurface.CLI,
                    operations: f.projects.slice(0, size).flatMap((project) =>
                        capabilities.map((op) => ({
                            ...op,
                            projectUuid: project.project_uuid,
                        })),
                    ),
                },
                f.loaders,
            );
            return { sql, result };
        } finally {
            f.database.off('query', listener);
        }
    };
    const small = await count(3);
    const large = await count(50);
    const families = (sql: string[]) =>
        Object.fromEntries(
            [
                ...new Set(
                    sql.map(
                        (query) => /from "([^"]+)"/.exec(query)?.[1] ?? 'other',
                    ),
                ),
            ]
                .sort()
                .map((family) => [
                    family,
                    sql.filter(
                        (query) =>
                            (/from "([^"]+)"/.exec(query)?.[1] ?? 'other') ===
                            family,
                    ).length,
                ]),
        );
    expect(families(large.sql)).toEqual(families(small.sql));
    expect(large.sql.length).toBe(9);
    expect(large.sql.every((query) => query.startsWith('select'))).toBe(true);
    for (const [index, project] of f.projects.entries()) {
        const queryIndex =
            index * capabilities.length +
            capabilities.findIndex((op) => op.key === AgentCapability.Query);
        const deployIndex =
            index * capabilities.length +
            capabilities.findIndex(
                (op) => op.key === AgentCapability.DeployUpload,
            );
        expect({
            project: project.name,
            allowed: large.result[queryIndex] === null,
        }).toEqual({
            project: project.name,
            allowed: index % 2 === 1 || index === 2,
        });
        expect({
            project: project.name,
            allowed: large.result[deployIndex] === null,
        }).toEqual({ project: project.name, allowed: index % 2 === 0 });
    }
    expect(families(large.sql)).toMatchInlineSnapshot(`
      {
        "group_memberships": 2,
        "organization_agent_capability_policies": 1,
        "organization_membership_custom_roles": 1,
        "project_group_access_custom_roles": 1,
        "project_memberships": 1,
        "projects": 1,
        "scoped_roles": 1,
        "users": 1,
      }
    `);
});

it('refuses loaders that are not the models the single check uses', async () => {
    const f = await fixture();
    const args = {
        account: f.accounts[5],
        organizationUuid: f.org.organization_uuid,
        surface: AgentActorSurface.CLI,
        operations: [
            {
                kind: 'capability' as const,
                key: AgentCapability.Query,
                projectUuid: f.projects[0].project_uuid,
            },
        ],
    };
    const message =
        'Bulk agent permission loaders must be the models this service uses.';
    await expect(
        f.service.evaluateOperations(args, {
            userModel: {
                getAgentRoleAssignmentsForProjects: (...loaderArgs) =>
                    f.loaders.userModel.getAgentRoleAssignmentsForProjects(
                        ...loaderArgs,
                    ),
            },
            projectModel: f.loaders.projectModel,
        }),
    ).rejects.toThrow(message);
    await expect(
        f.service.evaluateOperations(args, {
            userModel: f.loaders.userModel,
            projectModel: {
                getSummaries: (...loaderArgs) =>
                    f.loaders.projectModel.getSummaries(...loaderArgs),
            },
        }),
    ).rejects.toThrow(message);
});
it('reads changed roles again on the next call', async () => {
    const f = await fixture();
    const args = {
        account: f.accounts[5],
        organizationUuid: f.org.organization_uuid,
        surface: AgentActorSurface.CLI,
        operations: [
            {
                kind: 'capability' as const,
                key: AgentCapability.Query,
                projectUuid: f.projects[0].project_uuid,
            },
        ],
    };
    expect(await f.service.evaluateOperations(args, f.loaders)).toEqual([null]);
    await f
        .database('project_memberships')
        .where({
            user_id: f.people[5].user_id,
            project_id: f.projects[0].project_id,
        })
        .delete();
    expect(await f.service.evaluateOperations(args, f.loaders)).toMatchObject([
        { reason: 'agent_capability_denied' },
    ]);
});

it('preserves model role unions and rejects unknown or foreign projects without a partial answer', async () => {
    const f = await fixture();
    const projectUuids = f.projects
        .slice(0, 3)
        .map((project) => project.project_uuid);
    const member = await f.users.getAgentRoleAssignmentsForProjects(
        f.people[5].user_uuid,
        f.org.organization_uuid,
        [...projectUuids, null],
    );
    expect(member.get(projectUuids[0])).toEqual({
        systemRoles: ['member', 'viewer'],
        customRoles: [],
    });
    expect(member.get(projectUuids[1])).toEqual({
        systemRoles: ['member', 'developer'],
        customRoles: [],
    });
    expect(member.get(null)).toEqual({
        systemRoles: ['member'],
        customRoles: [],
    });
    const custom = await f.users.getAgentRoleAssignmentsForProjects(
        f.people[6].user_uuid,
        f.org.organization_uuid,
        projectUuids,
    );
    expect(custom.get(projectUuids[0])).toEqual({
        systemRoles: ['member'],
        customRoles: [
            {
                roleUuid: f.custom.role_uuid,
                scopes: [AGENT_CAPABILITY_SCOPES[AgentCapability.Query]],
            },
        ],
    });
    const absent = await f.users.getAgentRoleAssignmentsForProjects(
        f.people[8].user_uuid,
        f.org.organization_uuid,
        projectUuids,
    );
    expect(absent.get(projectUuids[0])).toEqual({
        systemRoles: ['member'],
        customRoles: [],
    });
    const foreign = await fixture();
    await forEachSequential(
        [
            '00000000-0000-4000-8000-000000000099',
            foreign.projects[0].project_uuid,
        ],
        async (projectUuid) => {
            const operation = {
                kind: 'capability' as const,
                key: AgentCapability.Query,
                projectUuid,
            };
            const base = {
                account: f.accounts[0],
                organizationUuid: f.org.organization_uuid,
                surface: AgentActorSurface.CLI,
            };
            await expect(
                f.service.evaluateOperations(
                    {
                        ...base,
                        operations: [operation],
                    },
                    f.loaders,
                ),
            ).rejects.toThrow();
            await expect(
                f.service.assertOperation({ ...base, ...operation }),
            ).rejects.toThrow();
        },
    );
});

const approvalFixture = (f: Awaited<ReturnType<typeof fixture>>) => {
    const service = new AgentConnectionApprovalService({
        siteUrl: 'https://instance.example',
        model: {
            insertPending: vi.fn(),
            findOwned: vi.fn(),
            bindReview: vi.fn(),
            sealDecision: vi.fn(),
            consumeCallback: vi.fn(),
        },
        userModel: f.users,
        projectModel: f.projectModel,
        featureFlags: f.flags,
        oauthModel: { getClient: vi.fn(), validateRedirectUriStrict: vi.fn() },
        agentPermissionService: f.service,
        reviewModel: new AgentConnectionApprovalReadModel({
            database: f.database,
        }),
    });
    const request = (
        index: number,
        count: number,
    ): DbAgentConnectionApprovalRequest =>
        ({
            organization_uuid: f.org.organization_uuid,
            subject_user_uuid: f.people[index].user_uuid,
            requested_projects: f.projects
                .slice(0, count)
                .map((p) => p.project_uuid),
            requested_capabilities: Object.values(AgentCapability),
        }) as DbAgentConnectionApprovalRequest;
    return { service, request };
};

it('review offered and blocked cells agree with independent capability policy and person permissions in managed mode', async () => {
    const f = await fixture();
    const approval = approvalFixture(f);
    let cells = 0;
    await forEachSequential(
        [...f.accounts.entries()],
        async ([index, account]) => {
            const answer = await approval.service.getReviewAnswer(
                account,
                approval.request(index, 3),
            );
            await forEachSequential(answer, async (project) => {
                await forEachSequential(
                    project.capabilities.filter(
                        (c) => c.visibility !== 'hidden',
                    ),
                    async (capability) => {
                        const result = await refusal(
                            f.service.assertOperation({
                                account,
                                organizationUuid: f.org.organization_uuid,
                                surface: AgentActorSurface.CLI,
                                projectUuid: project.projectUuid,
                                kind: 'capability',
                                key: capability.capability,
                            }),
                        );
                        expect({
                            project: project.projectUuid,
                            person: account.user.id,
                            capability: capability.capability,
                            offered: capability.visibility === 'offered',
                        }).toEqual({
                            project: project.projectUuid,
                            person: account.user.id,
                            capability: capability.capability,
                            offered:
                                personAllowsAgentCapability(
                                    account.user.ability,
                                    f.org.organization_uuid,
                                    project.projectUuid,
                                    capability.capability,
                                ) && result === null,
                        });
                        cells += 1;
                    },
                );
            });
        },
    );
    expect(cells).toBe(8 * 3 * 8);
});

it('review answer uses equal SQL round trips for 3 and 50 differentiated projects', async () => {
    const f = await fixture();
    await f.savePolicy({ allowedGroupUuids: [f.group.group_uuid] });
    const approval = approvalFixture(f);
    const count = async (size: number) => {
        const sql: string[] = [];
        const listener = (query: { sql: string }) => sql.push(query.sql);
        f.database.on('query', listener);
        try {
            return {
                answer: await approval.service.getReviewAnswer(
                    f.accounts[7],
                    approval.request(7, size),
                ),
                sql,
            };
        } finally {
            f.database.off('query', listener);
        }
    };
    const small = await count(3);
    const large = await count(50);
    expect(small.answer).toHaveLength(3);
    expect(large.answer).toHaveLength(50);
    expect(large.sql.length).toBe(small.sql.length);
    expect(
        large.sql.filter((query) => !/^(select|with)\b/i.test(query.trim())),
    ).toEqual([]);
    expect(
        large.sql.filter((query) =>
            query.includes('from "pre_aggregate_definitions"'),
        ),
    ).toHaveLength(1);
    expect(
        large.sql.filter((query) => query.includes('from "cached_explore"')),
    ).toHaveLength(1);
    expect({
        small: small.sql.length,
        large: large.sql.length,
    }).toMatchSnapshot();
    for (const project of large.answer) {
        const fixtureIndex = f.projects.findIndex(
            (p) => p.project_uuid === project.projectUuid,
        );
        expect(
            project.capabilities.find(
                (c) => c.capability === AgentCapability.Query,
            )?.visibility,
        ).toBe(
            (fixtureIndex % 2 === 1 || fixtureIndex === 2) &&
                personAllowsAgentCapability(
                    f.accounts[7].user.ability,
                    f.org.organization_uuid,
                    project.projectUuid,
                    AgentCapability.Query,
                )
                ? 'offered'
                : 'blocked',
        );
        expect(
            project.capabilities.find(
                (c) => c.capability === AgentCapability.DeployUpload,
            )?.visibility,
        ).toBe(fixtureIndex % 2 === 0 ? 'offered' : 'blocked');
    }
});

it('reads scheduled refresh from both real schema sources and narrows only the affected project', async () => {
    const f = await fixture();
    const approval = approvalFixture(f);
    const definition = { name: 'daily', dimensions: [], metrics: [] };
    const cache = async (index: number, preAggregates: unknown[]) => {
        const [explore] = await f
            .database('cached_explore')
            .insert({
                project_uuid: f.projects[index].project_uuid,
                name: `source_${index}`,
                table_names: [],
                explore: { name: `source_${index}`, preAggregates },
            })
            .returning('*');
        return explore;
    };
    const stored = await cache(1, []);
    const noCron = await cache(3, [
        definition,
        { ...definition, refresh: { cron: null } },
    ]);
    await cache(2, [{ ...definition, refresh: { cron: '0 * * * *' } }]);
    await f.database('pre_aggregate_definitions').insert(
        [stored, noCron].map((explore, index) => ({
            project_uuid: explore.project_uuid,
            source_cached_explore_uuid: explore.cached_explore_uuid,
            pre_agg_cached_explore_uuid: explore.cached_explore_uuid,
            pre_aggregate_definition: definition,
            materialization_metric_query: null,
            materialization_query_error: null,
            refresh_cron: index === 0 ? '0 * * * *' : null,
            materialize_on_compile: true,
        })),
    );
    const answer = await approval.service.getReviewAnswer(
        f.accounts[0],
        approval.request(0, 4),
    );
    expect(answer).toHaveLength(4);
    for (const project of answer) {
        const index = f.projects.findIndex(
            (p) => p.project_uuid === project.projectUuid,
        );
        const scheduled = index === 1 || index === 2;
        expect(project.selectable).toBe(true);
        expect(
            project.capabilities.find(
                (c) => c.capability === AgentCapability.DeployUpload,
            )?.reasonCode,
        ).toBe(scheduled ? 'scheduled_pre_aggregate_refresh' : null);
        expect(
            project.capabilities.find(
                (c) => c.capability === AgentCapability.Administration,
            )?.visibility,
        ).toBe('offered');
        expect(
            project.capabilities.find(
                (c) => c.capability === AgentCapability.Query,
            )?.visibility,
        ).toBe('offered');
    }
});

it.each([
    'managed',
    'managed-limited',
    'managed-disabled',
    'managed-group-limited',
    'legacy',
    'legacy-group-limited',
] as const)(
    'review agrees with status for every parity person/project/capability in %s mode',
    async (scenario) => {
        const mode = scenario.startsWith('legacy') ? 'legacy' : 'managed';
        const f = await fixture(true);
        await f.savePolicy({
            mode,
            allowedCapabilities:
                scenario === 'managed-disabled'
                    ? []
                    : AGENT_CAPABILITY_LIMIT_DEFAULTS.filter(
                          (capability) =>
                              scenario !== 'managed-limited' ||
                              capability !== AgentCapability.RawSql,
                      ),
            allowedGroupUuids: scenario.endsWith('group-limited')
                ? [f.group.group_uuid]
                : null,
            systemRoleMatrix: {
                ...f.roleMatrix,
                viewer: [AgentCapability.Query, AgentCapability.RawSql],
            },
        });
        await f.database('scoped_roles').insert(
            [
                'view:Project',
                'manage:SqlRunner',
                AGENT_CAPABILITY_SCOPES[AgentCapability.RawSql],
            ].map((scope_name) => ({
                role_uuid: f.custom.role_uuid,
                scope_name,
                granted_by: f.people[0].user_uuid,
            })),
        );
        const approval = approvalFixture(f);
        const statusService = new AgentConnectionService({
            model: new AgentConnectionGrantModel({ database: f.database }),
            userModel: f.users,
            projectModel: f.projectModel,
            featureFlags: f.flags,
            getAgentPermissionService: () => f.service,
        });
        const supported = Object.values(AgentCapability).filter(
            supportsAgentConnectionCapability,
        );
        let cells = 0;
        await forEachSequential(
            [...f.accounts.entries()],
            async ([index, account]) => {
                const answer = await approval.service.getReviewAnswer(
                    account,
                    approval.request(index, 3),
                );
                await forEachSequential(
                    f.projects.slice(0, 3),
                    async (project) => {
                        await forEachSequential(
                            supported,
                            async (capability) => {
                                const [grant] = await f
                                    .database('agent_connection_grants')
                                    .insert({
                                        organization_uuid:
                                            f.org.organization_uuid,
                                        subject_user_uuid: account.user.id,
                                        client_id: 'lightdash-cli',
                                        credential_kind: 'oauth',
                                        actor_kind: 'agent',
                                        name: `matrix-${cells}`,
                                        resource: 'https://instance.example',
                                        approved_capabilities: [capability],
                                        approved_project_uuids: [
                                            project.project_uuid,
                                        ],
                                        resource_constraints: {
                                            version: 2,
                                            projectCapabilities: {
                                                [project.project_uuid]: [
                                                    capability,
                                                ],
                                            },
                                        },
                                        grant_contract_version: 1,
                                        approval_method: 'browser_consent',
                                        expires_at: new Date(
                                            Date.now() + 60000,
                                        ),
                                    })
                                    .returning('*');
                                const status = await statusService.status(
                                    account,
                                    grant.agent_connection_grant_uuid,
                                );
                                const effective =
                                    status.effectiveProjects[0].capabilities[0];
                                const cell = answer
                                    .find(
                                        (p) =>
                                            p.projectUuid ===
                                            project.project_uuid,
                                    )
                                    ?.capabilities.find(
                                        (c) => c.capability === capability,
                                    );
                                expect({
                                    mode,
                                    person: index,
                                    project: project.name,
                                    capability,
                                    offered: cell?.visibility === 'offered',
                                }).toEqual({
                                    mode,
                                    person: index,
                                    project: project.name,
                                    capability,
                                    offered: effective.allowed,
                                });
                                if (
                                    index === 4 &&
                                    capability === AgentCapability.RawSql
                                ) {
                                    expect(cell).toMatchObject({
                                        visibility: 'blocked',
                                        reasonCode: 'person_permission',
                                    });
                                    expect(effective).toMatchObject({
                                        allowed: false,
                                        reason: 'person_permission',
                                    });
                                }
                                if (
                                    index === 6 &&
                                    capability === AgentCapability.RawSql
                                ) {
                                    const allowed =
                                        scenario === 'managed' ||
                                        scenario === 'legacy';
                                    expect(cell?.visibility).toBe(
                                        allowed ? 'offered' : 'blocked',
                                    );
                                    expect(effective.allowed).toBe(allowed);
                                    if (scenario === 'managed-limited')
                                        expect(cell?.reasonCode).toBe(
                                            'action_disabled',
                                        );
                                }
                                if (!cell)
                                    expect(effective.reason).toBe(
                                        'project_access',
                                    );
                                cells += 1;
                            },
                        );
                    },
                );
            },
        );
        expect(cells).toBe(9 * 3 * 8);
    },
);

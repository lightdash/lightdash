import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    AgentCapability,
    FeatureFlags,
    ProjectMemberRole,
} from '@lightdash/common';
import { AgentConnectionService } from '../../../auth/agentConnectionGrants/AgentConnectionService';
import { ReferenceAgentConnectionService } from '../../../auth/agentConnectionGrants/AgentConnectionService.reference.mock';
import * as audit from '../../../logging/winston';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { statusFixture } from './agent_connection_status.mock';
import { fixture as measurementFixture } from './launch-measurements/fixture.mock';
import { measure } from './launch-measurements/metrics';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => {
    vi.restoreAllMocks();
});

const setup = async () => {
    const f = await statusFixture(migrated.database, true);
    const deps = {
        model: new AgentConnectionGrantModel({ database: f.database }),
        userModel: f.users,
        projectModel: f.projectModel,
        featureFlags: f.flags,
        getAgentPermissionService: () => f.service,
    };
    const current = new AgentConnectionService(deps);
    const reference = new ReferenceAgentConnectionService(deps);
    const grant = async (
        person: number,
        actions = f.projects
            .slice(0, 3)
            .map(() => Object.values(AgentCapability)),
    ) => {
        const projects = f.projects
            .slice(0, actions.length)
            .map((project) => project.project_uuid);
        const [row] = await f
            .database('agent_connection_grants')
            .insert({
                organization_uuid: f.org.organization_uuid,
                subject_user_uuid: f.people[person].user_uuid,
                client_id: 'lightdash-cli',
                credential_kind: 'oauth',
                actor_kind: 'agent',
                name: 'Status parity',
                resource: 'https://instance.example',
                approved_capabilities: [...new Set(actions.flat())],
                approved_project_uuids: projects,
                resource_constraints: {
                    version: 2,
                    projectCapabilities: Object.fromEntries(
                        projects.map((uuid, index) => [uuid, actions[index]]),
                    ),
                },
                grant_contract_version: 1,
                approval_method: 'browser_consent',
                expires_at: new Date(Date.now() + 3600000),
            })
            .returning('*');
        return row.agent_connection_grant_uuid;
    };
    const compare = async (person: number, uuid: string) => {
        const expected = await reference.status(f.accounts[person], uuid);
        const actual = await current.status(f.accounts[person], uuid);
        expect(actual).toEqual(expected);
        let cells = 0;
        actual.effectiveProjects.forEach((project, index) => {
            project.capabilities.forEach((cell, action) => {
                expect(cell).toEqual(
                    expected.effectiveProjects[index].capabilities[action],
                );
                cells += 1;
            });
        });
        return { actual, cells };
    };
    return { ...f, current, reference, grant, compare };
};

it.each([
    'managed',
    'managed-limited',
    'managed-disabled',
    'managed-group-limited',
    'legacy',
    'legacy-group-limited',
] as const)(
    'matches every status cell in %s mode for every role and group fixture',
    async (scenario) => {
        const f = await setup();
        await f.savePolicy({
            mode: scenario.startsWith('legacy') ? 'legacy' : 'managed',
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
        });
        let cells = 0;
        for await (const [index] of f.accounts.entries()) {
            const uuid = await f.grant(index);
            cells += (await f.compare(index, uuid)).cells;
        }
        expect(cells).toBe(9 * 3 * Object.values(AgentCapability).length);
        console.log('STATUS_PARITY_CELLS', scenario, cells);
    },
);

it.each([
    'mixed',
    'deleted',
    'lost-access',
    'invalid',
    'expired',
    'revoked',
    'person-flag-off',
    'org-flag-off',
    'multiple-groups-and-roles',
] as const)(
    'preserves status fields and reason ordering for %s',
    async (scenario) => {
        const f = await setup();
        const person = ['lost-access', 'multiple-groups-and-roles'].includes(
            scenario,
        )
            ? 7
            : 0;
        const uuid = await f.grant(
            person,
            scenario === 'mixed'
                ? [
                      [AgentCapability.Query],
                      [AgentCapability.RawSql, AgentCapability.ReadDiscover],
                      [AgentCapability.Export, AgentCapability.DeployUpload],
                  ]
                : undefined,
        );
        if (scenario === 'deleted')
            await f
                .database('projects')
                .where('project_uuid', f.projects[0].project_uuid)
                .delete();
        if (scenario === 'lost-access')
            await f
                .database('group_memberships')
                .where('user_id', f.people[person].user_id)
                .delete();
        if (scenario === 'invalid')
            await f
                .database<Record<string, unknown>>('agent_connection_grants')
                .where('agent_connection_grant_uuid', uuid)
                .update({ resource_constraints: { version: -1 } });
        if (scenario === 'expired')
            await f
                .database<Record<string, unknown>>('agent_connection_grants')
                .where('agent_connection_grant_uuid', uuid)
                .update({ approved_at: new Date(0), expires_at: new Date(1) });
        if (scenario === 'revoked')
            await f
                .database('agent_connection_grants')
                .where('agent_connection_grant_uuid', uuid)
                .update({ revoked_at: new Date() });
        if (scenario.endsWith('flag-off'))
            f.flags.get.mockImplementation(
                async (args: {
                    featureFlagId: string;
                    user?: { userUuid?: string };
                }) => ({
                    id: args.featureFlagId,
                    enabled:
                        args.featureFlagId !== FeatureFlags.AgentIdentity ||
                        (scenario === 'person-flag-off'
                            ? !args.user?.userUuid
                            : !!args.user?.userUuid),
                }),
            );
        if (scenario === 'multiple-groups-and-roles') {
            const [group] = await f
                .database('groups')
                .insert({
                    organization_id: f.org.organization_id,
                    name: 'Second group',
                    created_by_user_uuid: f.people[0].user_uuid,
                    updated_by_user_uuid: f.people[0].user_uuid,
                })
                .returning('*');
            await f.database('group_memberships').insert({
                group_uuid: group.group_uuid,
                user_id: f.people[person].user_id,
                organization_id: f.org.organization_id,
            });
            await f.database('project_group_access').insert({
                project_uuid: f.projects[0].project_uuid,
                group_uuid: group.group_uuid,
                role: ProjectMemberRole.EDITOR,
            });
            await f.database('project_memberships').insert({
                project_id: f.projects[0].project_id,
                user_id: f.people[person].user_id,
                role: ProjectMemberRole.VIEWER,
            });
            await f.savePolicy({
                allowedGroupUuids: [f.group.group_uuid, group.group_uuid],
            });
        }
        const result = await f.compare(person, uuid);
        expect(result.cells).toBe(
            scenario === 'mixed'
                ? 5
                : 3 * Object.values(AgentCapability).length,
        );
        console.log('STATUS_EDGE_CELLS', scenario, result.cells);
    },
);

// A project that changes organisation while status runs makes the bulk check throw a refusal.
it('falls back per project when the bulk check throws a refusal: same cells as before, and no action-log rows', async () => {
    const f = await setup();
    const uuid = await f.grant(0);
    // A refusal by policy that the single check would log: Query is outside the ceiling.
    await f.savePolicy({
        allowedCapabilities: AGENT_CAPABILITY_LIMIT_DEFAULTS.filter(
            (capability) => capability !== AgentCapability.Query,
        ),
    });
    const moved = f.projects[1].project_uuid;
    const elsewhere = '99999999-9999-4999-8999-999999999999';
    const summary = f.projectModel.getSummary.bind(f.projectModel);
    const summaries = f.projectModel.getSummaries.bind(f.projectModel);
    vi.spyOn(f.projectModel, 'getSummary').mockImplementation(
        async (projectUuid) => {
            const row = await summary(projectUuid);
            return projectUuid === moved
                ? { ...row, organizationUuid: elsewhere }
                : row;
        },
    );
    const bulk = vi
        .spyOn(f.projectModel, 'getSummaries')
        .mockImplementation(async (projectUuids) =>
            (await summaries(projectUuids)).map((row) =>
                row.projectUuid === moved
                    ? { ...row, organizationUuid: elsewhere }
                    : row,
            ),
        );
    const rows = async () =>
        (await f.database('agent_action_log').select('agent_action_log_uuid'))
            .length;
    const before = await rows();
    const events = vi.spyOn(audit, 'logAuditEvent');
    const actual = await f.current.status(f.accounts[0], uuid);
    expect(await rows()).toBe(before);
    expect(
        events.mock.calls.filter(([event]) =>
            JSON.stringify(event).includes('agent_action.refused'),
        ),
    ).toEqual([]);
    expect(bulk.mock.calls.length).toBe(1 + actual.effectiveProjects.length);
    const expected = await f.reference.status(f.accounts[0], uuid);
    expect(actual).toEqual(expected);
    const movedCells = actual.effectiveProjects.find(
        (project) => project.projectUuid === moved,
    )!.capabilities;
    expect(
        movedCells.filter((cell) => cell.reason === 'agent_policy').length,
    ).toBeGreaterThan(0);
    expect(movedCells.some((cell) => cell.allowed)).toBe(false);
    const otherCells = actual.effectiveProjects.find(
        (project) => project.projectUuid !== moved,
    )!.capabilities;
    expect(
        otherCells.find((cell) => cell.capability === AgentCapability.Query),
    ).toMatchObject({ allowed: false });
    expect(
        actual.effectiveProjects
            .filter((project) => project.projectUuid !== moved)
            .some((project) =>
                project.capabilities.some((cell) => cell.allowed),
            ),
    ).toBe(true);
});

it.each(['removed', 'inactive'] as const)(
    'preserves the error for a %s person',
    async (state) => {
        const f = await setup();
        const uuid = await f.grant(0);
        if (state === 'removed')
            await f
                .database('organization_memberships')
                .where({
                    organization_id: f.org.organization_id,
                    user_id: f.people[0].user_id,
                })
                .delete();
        else
            await f
                .database('users')
                .where('user_id', f.people[0].user_id)
                .update({ is_active: false });
        const capture = async (call: Promise<unknown>) => {
            try {
                await call;
            } catch (error) {
                return error;
            }
            throw new Error('Expected unavailable person');
        };
        const expected = await capture(f.reference.status(f.accounts[0], uuid));
        expect(await capture(f.current.status(f.accounts[0], uuid))).toEqual(
            expected,
        );
    },
);

it('status makes the same number of database reads for 1, 10 and 50 projects', async () => {
    const f = await measurementFixture(migrated.database);
    try {
        const reads: number[] = [];
        for await (const size of [1, 10, 50]) {
            await f.grow(size);
            const grant = await f.grant(size);
            await f.call(
                `/api/v2/user/agent-connections/${grant.grantUuid}/status`,
            );
            const result = await measure(migrated.database, () =>
                f.call(
                    `/api/v2/user/agent-connections/${grant.grantUuid}/status`,
                ),
            );
            process.stdout.write(
                `STATUS_READS ${JSON.stringify({ size, reads: result.sample.reads, rows: result.sample.rows })}\n`,
            );
            expect(result.value.results.effectiveProjects).toHaveLength(size);
            expect.soft(result.sample.statements).toBe(result.sample.reads);
            expect.soft(result.sample.rows).toBeLessThanOrEqual(32 + 5 * size);
            reads.push(result.sample.reads);
        }
        expect(reads).toEqual([23, 23, 23]);
    } finally {
        await f.close();
    }
});

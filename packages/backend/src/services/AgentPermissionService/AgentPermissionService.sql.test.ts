import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import {
    expectAdmissionSql,
    setupPermissionSql,
} from './agentPermissionSqlFixture';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

test.each([
    {
        name: 'legacy null',
        mode: 'legacy',
        groups: null,
        live: false,
        member: true,
    },
    {
        name: 'legacy live member',
        mode: 'legacy',
        groups: ['live'],
        live: true,
        member: true,
    },
    {
        name: 'legacy live non-member',
        mode: 'legacy',
        groups: ['live'],
        live: true,
        member: false,
    },
    {
        name: 'legacy deleted',
        mode: 'legacy',
        groups: ['deleted'],
        live: false,
        member: false,
    },
    {
        name: 'legacy empty',
        mode: 'legacy',
        groups: [],
        live: false,
        member: false,
    },
    {
        name: 'managed null',
        mode: 'managed',
        groups: null,
        live: false,
        member: true,
    },
    {
        name: 'managed live member',
        mode: 'managed',
        groups: ['live'],
        live: true,
        member: true,
    },
    {
        name: 'managed live non-member',
        mode: 'managed',
        groups: ['live'],
        live: true,
        member: false,
    },
    {
        name: 'managed deleted',
        mode: 'managed',
        groups: ['deleted'],
        live: false,
        member: false,
    },
    {
        name: 'managed empty',
        mode: 'managed',
        groups: [],
        live: false,
        member: false,
    },
] as const)('characterizes direct and gated SQL: $name', async (profile) => {
    const h = setupPermissionSql(database, tracker);
    h.state.policy.mode = profile.mode;
    h.state.policy.allowedGroupUuids =
        profile.groups === null ? null : [...profile.groups];
    h.state.existingGroups = profile.live ? ['live'] : [];
    h.state.members = profile.member ? [h.operation.account.user.id] : [];
    const assert = async (
        request: Awaited<ReturnType<typeof h.service.loadRequest>> | null,
    ) => {
        const call =
            request === null
                ? h.service.assertOperation(h.operation)
                : h.service.assertOperationWithRequest({
                      request,
                      operation: h.operation,
                  });
        if (profile.groups !== null && !profile.member)
            await expect(call).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                    policyVersion: 7,
                    operation: h.operation.key,
                    projectUuid: 'project',
                },
            });
        else await expect(call).resolves.toBeUndefined();
    };
    await assert(null);
    expectAdmissionSql(tracker, {
        policy: 1,
        groups: 0,
        people: 0,
        membership: profile.live ? 1 : 0,
    });
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    if (request.enforcementMode !== 'off') await assert(request);
    expectAdmissionSql(tracker, {
        policy: 2,
        groups: 0,
        people: 0,
        membership: profile.live ? 2 : 0,
    });
});

test.each([
    { groups: null },
    { groups: [] },
    { groups: ['live'] },
    { groups: ['deleted'] },
])('flag off reads nothing for $groups', async ({ groups }) => {
    const h = setupPermissionSql(database, tracker);
    h.state.policy.allowedGroupUuids = groups;
    h.state.allowedUserUuids = ['person'];
    h.deps.featureFlagModel.get.mockResolvedValue({ enabled: false });
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    expect(request.enforcementMode).toBe('off');
    await h.service.assertOperationWithRequest({
        request,
        operation: h.operation,
    });
    await h.service.assertOperation(h.operation);
    await h.service.assertActorVerified({
        ...h.operation,
        actorVerified: false,
    });
    expectAdmissionSql(tracker, {
        policy: 0,
        groups: 0,
        people: 0,
        membership: 0,
    });
});

test.each([{ groups: null }, { groups: ['live'] }])(
    'managed evaluation ignores stored people without a hydration read: $groups',
    async ({ groups }) => {
        const h = setupPermissionSql(database, tracker);
        h.state.policy.mode = 'managed';
        h.state.allowedUserUuids = [h.operation.account.user.id];
        h.state.policy.allowedGroupUuids = groups;
        const request = await h.service.loadRequest(
            h.operation.organizationUuid,
        );
        await Promise.all(
            [1, 2, 3].map((n) =>
                h.service.assertOperationWithRequest({
                    request,
                    operation: { ...h.operation, projectUuid: `project-${n}` },
                }),
            ),
        );
        expectAdmissionSql(tracker, {
            policy: 1,
            groups: 0,
            people: 0,
            membership: groups === null ? 0 : 1,
        });
        expect(h.deps.projectModel.getSummary).toHaveBeenCalledTimes(3);
        expect(h.deps.userModel.getAgentRoleAssignments).toHaveBeenCalledTimes(
            3,
        );
    },
);

test('freezes its snapshot but a second request sees a policy change', async () => {
    const h = setupPermissionSql(database, tracker);
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    expect(Object.isFrozen(request.policy)).toBe(true);
    expect(Object.isFrozen(request.policy?.storedAllowedGroupUuids)).toBe(true);
    expect(Object.isFrozen(request.policy?.systemRoleMatrix.viewer)).toBe(true);
    h.state.policy.allowedGroupUuids = [];
    await h.service.assertOperationWithRequest({
        request,
        operation: h.operation,
    });
    await h.service.assertOperationWithRequest({
        request,
        operation: h.operation,
    });
    const next = await h.service.loadRequest(h.operation.organizationUuid);
    expect(next.enforcementMode).toBe('admission');
    await expect(
        h.service.assertOperationWithRequest({
            request: next,
            operation: h.operation,
        }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    expectAdmissionSql(tracker, {
        policy: 2,
        groups: 0,
        people: 0,
        membership: 1,
    });
});

test('different actors never share a membership result', async () => {
    const h = setupPermissionSql(database, tracker);
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    await h.service.assertOperationWithRequest({
        request,
        operation: h.operation,
    });
    const other = {
        ...h.operation,
        account: {
            ...h.operation.account,
            user: { ...h.operation.account.user, id: 'outsider' },
        },
    };
    await expect(
        h.service.assertOperationWithRequest({ request, operation: other }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
    });
    expectAdmissionSql(tracker, {
        policy: 1,
        groups: 0,
        people: 0,
        membership: 2,
    });
    const membership = tracker.history.select.filter((q) =>
        q.sql.includes('from "group_memberships"'),
    );
    expect(membership[0].bindings).toEqual([
        h.operation.account.user.id,
        h.operation.organizationUuid,
        'live',
    ]);
    expect(membership[1].bindings).toEqual([
        'outsider',
        h.operation.organizationUuid,
        'live',
    ]);
});

test('rejects a mismatched organization before evaluating', async () => {
    const h = setupPermissionSql(database, tracker);
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    const operation = { ...h.operation, organizationUuid: 'different' };
    await expect(
        h.service.assertOperationWithRequest({ request, operation }),
    ).rejects.toThrow('organization');
    await expect(
        h.service.assertActorVerifiedWithRequest({
            request,
            operation: { ...operation, actorVerified: false },
        }),
    ).rejects.toThrow('organization');
    await expect(
        h.service.assertActorVerifiedWithRequest({
            request,
            operation: { ...operation, actorVerified: true },
        }),
    ).rejects.toThrow('organization');
    expectAdmissionSql(tracker, {
        policy: 1,
        groups: 0,
        people: 0,
        membership: 0,
    });
});

test('rejects a copy of a request that turns enforcement off', async () => {
    const h = setupPermissionSql(database, tracker);
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    expect(request.enforcementMode).toBe('admission');
    // @ts-expect-error a copy is not a request the service created
    const copy: typeof request = { ...request, policy: null };
    await expect(
        h.service.assertOperationWithRequest({
            request: copy,
            operation: h.operation,
        }),
    ).rejects.toThrow('not created by the permission service');
    await expect(
        h.service.assertActorVerifiedWithRequest({
            request: copy,
            operation: { ...h.operation, actorVerified: false },
        }),
    ).rejects.toThrow('not created by the permission service');
    expect(Object.isFrozen(request)).toBe(true);
    expectAdmissionSql(tracker, {
        policy: 1,
        groups: 0,
        people: 0,
        membership: 0,
    });
});

test('verified actors read nothing and unverified actors never read membership', async () => {
    const h = setupPermissionSql(database, tracker);
    await h.service.assertActorVerified({
        ...h.operation,
        actorVerified: true,
    });
    expect(h.deps.featureFlagModel.get).not.toHaveBeenCalled();
    expect(tracker.history.select).toHaveLength(0);
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    await expect(
        h.service.assertActorVerifiedWithRequest({
            request,
            operation: { ...h.operation, actorVerified: false },
        }),
    ).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
            policyVersion: 7,
        },
    });
    expectAdmissionSql(tracker, {
        policy: 1,
        groups: 0,
        people: 0,
        membership: 0,
    });
});

test.each(['member', 'non-member'] as const)(
    'concurrent assertions share a pending membership read: %s',
    async (result) => {
        const h = setupPermissionSql(database, tracker);
        const request = await h.service.loadRequest(
            h.operation.organizationUuid,
        );
        tracker.reset();
        let release: (
            rows: { group_uuid: string; user_uuid: string }[],
        ) => void = () => {};
        const pending = new Promise<
            { group_uuid: string; user_uuid: string }[]
        >((resolve) => {
            release = resolve;
        });
        tracker.on
            .select((q) => q.sql.includes('from "group_memberships"'))
            .response(() => pending);
        const calls = [1, 2, 3].map((n) =>
            h.service.assertOperationWithRequest({
                request,
                operation: { ...h.operation, projectUuid: `project-${n}` },
            }),
        );
        const settled = Promise.allSettled(calls);
        await vi.waitFor(() => expect(tracker.history.select).toHaveLength(1));
        release(
            result === 'member'
                ? [
                      {
                          group_uuid: 'live',
                          user_uuid: h.operation.account.user.id,
                      },
                  ]
                : [],
        );
        const outcomes = await settled;
        expect(outcomes.map((o) => o.status)).toEqual(
            Array(3).fill(result === 'member' ? 'fulfilled' : 'rejected'),
        );
        if (result === 'non-member') {
            expect(h.deps.agentActionLogModel.insert).toHaveBeenCalledTimes(3);
            expect(
                outcomes.map((o) =>
                    o.status === 'rejected'
                        ? o.reason.refusal.projectUuid
                        : null,
                ),
            ).toEqual(['project-1', 'project-2', 'project-3']);
        }

        expectAdmissionSql(tracker, {
            policy: 0,
            groups: 0,
            people: 0,
            membership: 1,
        });
    },
);

test('shares a rejected membership read and never retries or admits', async () => {
    const h = setupPermissionSql(database, tracker);
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    tracker.reset();
    tracker.on
        .select((q) => q.sql.includes('from "group_memberships"'))
        .simulateError('membership failed');
    const outcomes = await Promise.allSettled(
        [1, 2, 3].map(() =>
            h.service.assertOperationWithRequest({
                request,
                operation: h.operation,
            }),
        ),
    );
    expect(outcomes.every((o) => o.status === 'rejected')).toBe(true);
    await expect(
        h.service.assertOperationWithRequest({
            request,
            operation: h.operation,
        }),
    ).rejects.toThrow('membership failed');
    expect(h.deps.agentActionLogModel.insert).not.toHaveBeenCalled();

    expectAdmissionSql(tracker, {
        policy: 0,
        groups: 0,
        people: 0,
        membership: 1,
    });
});

test.each([
    {
        name: 'missing',
        missing: true,
        mode: 'legacy',
        groups: null,
        people: null,
        members: true,
        expectedPeople: 0,
        expectedMembership: 0,
        admitted: true,
    },
    {
        name: 'partly deleted',
        missing: false,
        mode: 'legacy',
        groups: ['live', 'deleted'],
        people: null,
        members: true,
        expectedPeople: 0,
        expectedMembership: 1,
        admitted: true,
    },
    {
        name: 'retained legacy people',
        missing: false,
        mode: 'legacy',
        groups: ['live'],
        people: ['departed'],
        members: true,
        expectedPeople: 0,
        expectedMembership: 1,
        admitted: true,
    },
    {
        name: 'departed managed people',
        missing: false,
        mode: 'managed',
        groups: ['live'],
        people: ['departed'],
        members: true,
        expectedPeople: 0,
        expectedMembership: 1,
        admitted: true,
    },
    {
        name: 'empty managed people',
        missing: false,
        mode: 'managed',
        groups: ['live'],
        people: [],
        members: true,
        expectedPeople: 0,
        expectedMembership: 1,
        admitted: true,
    },
    {
        name: 'foreign groups',
        missing: false,
        mode: 'legacy',
        groups: ['foreign'],
        people: null,
        members: true,
        expectedPeople: 0,
        expectedMembership: 0,
        admitted: false,
    },
] as const)('preserves edge admission and SQL: $name', async (profile) => {
    const h = setupPermissionSql(database, tracker);
    h.state.missing = profile.missing;
    h.state.policy.mode = profile.mode;
    h.state.policy.allowedGroupUuids =
        profile.groups === null ? null : [...profile.groups];
    h.state.allowedUserUuids =
        profile.people === null ? null : [...profile.people];
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    const result = h.service.assertOperationWithRequest({
        request,
        operation: h.operation,
    });
    if (profile.admitted) await expect(result).resolves.toBeUndefined();
    else
        await expect(result).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED },
        });
    expectAdmissionSql(tracker, {
        policy: 1,
        groups: 0,
        people: profile.expectedPeople,
        membership: profile.expectedMembership,
    });
    expect(h.deps.areGroupsAvailable).not.toHaveBeenCalled();
    if (profile.name === 'partly deleted')
        expect(tracker.history.select[1].bindings).toEqual([
            h.operation.account.user.id,
            h.operation.organizationUuid,
            'live',
            'deleted',
        ]);
});

test.each(['deleted', 'empty', 'non-member'])(
    'keeps the full legacy refusal and activity record: %s',
    async (state) => {
        const h = setupPermissionSql(database, tracker);
        h.state.policy.allowedGroupUuids =
            state === 'empty' ? [] : [state === 'deleted' ? 'deleted' : 'live'];
        h.state.members = [];
        const error = await h.service
            .assertOperation(h.operation)
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(AiAccessRefusedError);
        if (!(error instanceof AiAccessRefusedError))
            throw new Error('Expected refusal');
        expect({
            refusal: error.refusal,
            records: h.deps.agentActionLogModel.insert.mock.calls,
        }).toMatchInlineSnapshot(`
      {
        "records": [
          [
            {
              "action": "rest_operation",
              "agent_identity": {
                "act": {
                  "agent_uuid": null,
                  "client_id": null,
                  "sub": "mcp:unknown",
                  "surface": "mcp",
                },
                "sub": "user:test-user-uuid",
                "subject": {
                  "type": "user",
                  "uuid": "test-user-uuid",
                },
              },
              "capability": null,
              "object_id": "SqlRunnerController.runSql",
              "object_type": "agent_operation",
              "object_uuid": null,
              "organization_uuid": "test-org-uuid",
              "outcome": "denied",
              "policy_layer": "organization_setting",
              "policy_version": 7,
              "project_uuid": "project",
              "reason_code": "agent_user_not_allowed",
              "version_uuid": null,
            },
          ],
        ],
        "refusal": {
          "action": "ask_admin",
          "blockers": [
            {
              "capability": null,
              "checkId": "agent_admission",
              "message": "Your account is not allowed to use agents. Ask an organization admin to update agent access.",
              "policyLayer": "organization_setting",
              "reason": "agent_user_not_allowed",
              "settingsUrl": "/generalSettings/agentIdentity",
              "status": "refused",
            },
          ],
          "blockersComplete": true,
          "code": "ai_access_refused",
          "connectUrl": null,
          "explanationUrl": "/generalSettings/myAgentConnections",
          "message": "Your account is not allowed to use agents. Ask an organization admin to update agent access.",
          "operation": "SqlRunnerController.runSql",
          "policyLayer": "organization_setting",
          "policyVersion": 7,
          "projectUuid": "project",
          "reason": "agent_user_not_allowed",
          "requiredCapabilities": [],
          "settingsUrl": "/generalSettings/agentIdentity",
        },
      }
    `);
    },
);

test('keeps the full managed refusal and activity record', async () => {
    const h = setupPermissionSql(database, tracker);
    h.state.policy.mode = 'managed';
    h.state.policy.allowedGroupUuids = [];
    const error = await h.service
        .assertOperation(h.operation)
        .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiAccessRefusedError);
    if (!(error instanceof AiAccessRefusedError))
        throw new Error('Expected refusal');
    expect({
        refusal: error.refusal,
        records: h.deps.agentActionLogModel.insert.mock.calls,
    }).toMatchInlineSnapshot(`
      {
        "records": [
          [
            {
              "action": "rest_operation",
              "agent_identity": {
                "act": {
                  "agent_uuid": null,
                  "client_id": null,
                  "sub": "mcp:unknown",
                  "surface": "mcp",
                },
                "sub": "user:test-user-uuid",
                "subject": {
                  "type": "user",
                  "uuid": "test-user-uuid",
                },
              },
              "capability": null,
              "object_id": "SqlRunnerController.runSql",
              "object_type": "agent_operation",
              "object_uuid": null,
              "organization_uuid": "test-org-uuid",
              "outcome": "denied",
              "policy_layer": "organization_setting",
              "policy_version": 7,
              "project_uuid": "project",
              "reason_code": "agent_user_not_allowed",
              "version_uuid": null,
            },
          ],
        ],
        "refusal": {
          "action": "ask_admin",
          "blockers": [
            {
              "capability": null,
              "checkId": "agent_admission",
              "message": "Your account is not allowed to use agents. Ask an organization admin to update agent access.",
              "policyLayer": "organization_setting",
              "reason": "agent_user_not_allowed",
              "settingsUrl": "/generalSettings/agentIdentity",
              "status": "refused",
            },
          ],
          "blockersComplete": true,
          "code": "ai_access_refused",
          "connectUrl": null,
          "explanationUrl": "/generalSettings/myAgentConnections",
          "message": "Your account is not allowed to use agents. Ask an organization admin to update agent access.",
          "operation": "SqlRunnerController.runSql",
          "policyLayer": "organization_setting",
          "policyVersion": 7,
          "projectUuid": "project",
          "reason": "agent_user_not_allowed",
          "requiredCapabilities": [
            "raw_sql",
          ],
          "settingsUrl": "/generalSettings/agentIdentity",
        },
      }
    `);
});

test('copies and freezes the capability list while the next handle sees revocation', async () => {
    const h = setupPermissionSql(database, tracker);
    h.state.policy.mode = 'managed';
    h.state.policy.allowedCapabilities = [AgentCapability.RawSql];
    const request = await h.service.loadRequest(h.operation.organizationUuid);
    expect(Object.isFrozen(request.policy?.allowedCapabilities)).toBe(true);
    h.state.policy.allowedCapabilities.splice(0);
    await expect(
        h.service.assertOperationWithRequest({
            request,
            operation: h.operation,
        }),
    ).resolves.toBeUndefined();
    await expect(h.service.assertOperation(h.operation)).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED },
    });
    expectAdmissionSql(tracker, {
        policy: 2,
        groups: 0,
        people: 0,
        membership: 2,
    });
});

test.each([
    ['mcp_tool', 'read_content', AgentActorSurface.MCP],
    ['agent_tool', 'getMetadata', AgentActorSurface.IN_APP_AGENT],
    ['agent_tool', 'getMetadata', AgentActorSurface.SLACK_AGENT],
    ['agent_turn', 'agent_turn', AgentActorSurface.IN_APP_AGENT],
    ['agent_turn', 'agent_turn', AgentActorSurface.SLACK_AGENT],
    ['rest_operation', 'UserController.getAccount', AgentActorSurface.API],
] as const)(
    'raw historical lists never refuse %s %s on %s',
    async (kind, key, surface) => {
        const h = setupPermissionSql(database, tracker);
        h.state.policy.mode = 'managed';
        h.state.policy.allowedGroupUuids = null;
        h.state.allowedUserUuids = ['excluded-person'];
        h.state.allowedProjectUuids = ['excluded-project'];
        await expect(
            h.service.assertOperation({ ...h.operation, kind, key, surface }),
        ).resolves.toBeUndefined();
        expectAdmissionSql(tracker, {
            policy: 1,
            groups: 0,
            people: 0,
            membership: 0,
        });
    },
);

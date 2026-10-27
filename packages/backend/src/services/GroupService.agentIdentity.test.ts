import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AiAccessRefusedError,
    FeatureFlags,
    PromotionAction,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromSession, toSessionUser } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { createOAuthScopedAbility } from '../auth/oauthScopes/scopedAbility';
import * as auditLogger from '../logging/winston';
import { AgentCapabilityPolicyModel } from '../models/AgentCapabilityPolicyModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from './AiAccessService/agentExecutionContext';
import { GroupsService } from './GroupService';

const setup = (
    mode: 'managed' | 'admission' | 'people-only',
    enabled = true,
) => {
    const account = fromSession(
        {
            ...defaultSessionUser,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'Group' },
            ]),
        },
        'session-cookie',
    );
    const group = {
        uuid: 'allowed-group',
        organizationUuid: account.organization.organizationUuid,
        name: 'Allowed group',
        memberUuids: ['member'],
        members: [],
    };
    const membership = { groupUuid: group.uuid, userUuid: 'member' };
    const models = {
        getGroup: vi.fn().mockResolvedValue(group),
        getGroupWithMembers: vi.fn().mockResolvedValue(group),
        addGroupMembers: vi.fn().mockResolvedValue([membership]),
        removeGroupMember: vi.fn().mockResolvedValue(true),
        updateGroup: vi.fn().mockResolvedValue(group),
        deleteGroup: vi.fn().mockResolvedValue(undefined),
        upsertGroupAsCode: vi.fn().mockResolvedValue({
            action: PromotionAction.UPDATE,
            groupUuid: group.uuid,
        }),
    };
    const getPolicy = vi
        .spyOn(AgentCapabilityPolicyModel.prototype, 'get')
        .mockResolvedValue({
            mode: mode === 'managed' ? 'managed' : 'legacy',
            version: 1,
            allowedGroupUuids: mode === 'people-only' ? null : [group.uuid],
            allowedCapabilities: null,
            systemRoleMatrix: {} as never,
        });
    const service = new GroupsService({
        analytics: { track: vi.fn() } as never,
        groupsModel: models as never,
        projectModel: {} as never,
        featureFlagService: {
            get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled:
                    featureFlagId === FeatureFlags.AgentIdentity
                        ? enabled
                        : true,
            })),
        } as never,
    });
    const operations = {
        add: () => service.addGroupMember(toSessionUser(account), membership),
        remove: () =>
            service.removeGroupMember(toSessionUser(account), membership),
        replace: () =>
            service.update(toSessionUser(account), group.uuid, {
                members: [{ userUuid: 'member' }],
            }),
        delete: () => service.delete(toSessionUser(account), group.uuid),
        upsert: () =>
            service.upsertGroupAsCode(account, group.organizationUuid!, {
                version: 1,
                name: group.name,
                members: ['member@example.com'],
            }),
    };
    return { account, models, operations, getPolicy, group };
};

const operations = ['add', 'remove', 'replace', 'delete', 'upsert'] as const;

afterEach(() => vi.restoreAllMocks());

describe.each(['managed', 'admission', 'people-only'] as const)(
    'group policy changes in %s mode',
    (mode) => {
        test.each(operations)(
            'refuses agent %s before a write',
            async (operation) => {
                const f = setup(mode);
                await expect(
                    agentExecutionContext.run(
                        createAgentExecutionContext({
                            account: f.account,
                            surface: AgentActorSurface.CLI,
                            clientId: 'lightdash-cli',
                            agentUuid: null,
                            agentIdentityEnabled: true,
                            agentConnectionExecution: {
                                grantUuid: 'grant',
                                revision: 1,
                                subjectUserUuid: f.account.user.id,
                                organizationUuid: f.group.organizationUuid!,
                                clientId: 'lightdash-cli',
                                resource: 'https://lightdash.example',
                                refreshFamilyUuid: 'family',
                                scopes: ['read', 'write'],
                                operation: {
                                    kind: 'rest',
                                    key: 'GroupController.updateGroup',
                                },
                            },
                        }),
                        async () => f.operations[operation](),
                    ),
                ).rejects.toBeInstanceOf(AiAccessRefusedError);
                for (const method of [
                    'addGroupMembers',
                    'removeGroupMember',
                    'updateGroup',
                    'deleteGroup',
                    'upsertGroupAsCode',
                ] as const)
                    expect(f.models[method]).not.toHaveBeenCalled();
            },
        );

        test.each(operations)(
            'refuses OAuth %s through legacy user entry points',
            async (operation) => {
                const f = setup(mode);
                f.account.user.ability = createOAuthScopedAbility(
                    f.account.user.ability,
                    {
                        mode: 'log',
                        scopes: ['read', 'write'],
                        clientId: 'agent',
                        getRequest: () => ({
                            method: null,
                            routeTemplate: null,
                        }),
                    },
                );
                await expect(f.operations[operation]()).rejects.toBeInstanceOf(
                    AiAccessRefusedError,
                );
            },
        );

        test.each(operations)(
            'allows and audits human %s',
            async (operation) => {
                const f = setup(mode);
                const audit = vi
                    .spyOn(auditLogger, 'logAuditEvent')
                    .mockImplementation(() => {});
                await f.operations[operation]();
                expect(audit).toHaveBeenCalledWith(
                    expect.objectContaining({
                        actor: expect.objectContaining({
                            uuid: f.account.user.id,
                            type: 'session',
                        }),
                        status: 'allowed',
                        resource: expect.objectContaining({
                            type: 'Group',
                            organizationUuid: f.group.organizationUuid,
                            metadata: expect.objectContaining({
                                event: 'group.membership_changed',
                                groupUuid: f.group.uuid,
                            }),
                        }),
                    }),
                );
            },
        );

        test.each(operations)(
            'preserves flag-off agent %s',
            async (operation) => {
                const f = setup(mode, false);
                await agentExecutionContext.run(
                    createAgentExecutionContext({
                        account: f.account,
                        surface: AgentActorSurface.CLI,
                        clientId: 'lightdash-cli',
                        agentUuid: null,
                        agentIdentityEnabled: false,
                    }),
                    async () => f.operations[operation](),
                );
                expect(f.getPolicy).not.toHaveBeenCalled();
            },
        );
    },
);

test.each(['add', 'remove', 'upsert'] as const)(
    'does not audit an unchanged %s',
    async (operation) => {
        const f = setup('admission');
        const audit = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => {});
        f.models.addGroupMembers.mockResolvedValue([]);
        f.models.removeGroupMember.mockResolvedValue(false);
        f.models.upsertGroupAsCode.mockResolvedValue({
            action: PromotionAction.NO_CHANGES,
            groupUuid: f.group.uuid,
        });
        await f.operations[operation]();
        expect(
            audit.mock.calls.filter(
                ([event]) =>
                    event.resource.metadata?.event ===
                    'group.membership_changed',
            ),
        ).toEqual([]);
    },
);

test.each(operations)('does not audit a failed %s write', async (operation) => {
    const f = setup('admission');
    const audit = vi
        .spyOn(auditLogger, 'logAuditEvent')
        .mockImplementation(() => {});
    for (const method of [
        'addGroupMembers',
        'removeGroupMember',
        'updateGroup',
        'deleteGroup',
        'upsertGroupAsCode',
    ] as const)
        f.models[method].mockRejectedValue(new Error('write failed'));
    await expect(f.operations[operation]()).rejects.toThrow('write failed');
    expect(
        audit.mock.calls.filter(
            ([event]) =>
                event.resource.metadata?.event === 'group.membership_changed',
        ),
    ).toEqual([]);
});

test('records the affected member after the membership write', async () => {
    const f = setup('admission');
    const audit = vi
        .spyOn(auditLogger, 'logAuditEvent')
        .mockImplementation((event) => {
            if (event.resource.metadata?.event === 'group.membership_changed')
                expect(
                    f.models.addGroupMembers,
                ).toHaveBeenCalledExactlyOnceWith(f.group.uuid, ['member']);
        });
    await f.operations.add();
    expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
            resource: expect.objectContaining({
                metadata: {
                    event: 'group.membership_changed',
                    groupUuid: f.group.uuid,
                    operation: 'add',
                    memberUuids: ['member'],
                },
            }),
        }),
    );
});

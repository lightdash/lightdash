import {
    AgentActorSurface,
    AiAccessRefusedError,
    ScimSchemaType,
} from '@lightdash/common';
import * as auditLogger from '../../../logging/winston';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../../services/AiAccessService/agentExecutionContext';
import { ScimService } from './ScimService';
import { mockScimAccount, ScimServiceArgumentsMock } from './ScimService.mock';

const setup = (
    mode: 'managed' | 'admission' | 'people-only',
    enabled = true,
) => {
    const account = {
        ...mockScimAccount,
        authentication: {
            ...mockScimAccount.authentication,
            serviceAccountUuid: 'scim-actor',
        },
    };
    const organizationUuid = account.organization.organizationUuid!;
    const group = {
        uuid: 'allowed-group',
        organizationUuid,
        name: 'Allowed group',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        createdByUserUuid: null,
        updatedByUserUuid: null,
        members: [],
        memberUuids: [],
    };
    const groupsModel = {
        getGroup: vi.fn().mockResolvedValue(group),
        getGroupWithMembers: vi.fn().mockResolvedValue(group),
        find: vi.fn().mockResolvedValue({ data: [] }),
        updateGroup: vi
            .fn()
            .mockResolvedValue({ ...group, memberUuids: ['member'] }),
        deleteGroup: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(AgentCapabilityPolicyModel.prototype, 'get').mockResolvedValue({
        mode: mode === 'managed' ? 'managed' : 'legacy',
        version: 1,
        allowedGroupUuids: mode === 'people-only' ? null : [group.uuid],
        allowedCapabilities: null,
        systemRoleMatrix: {} as never,
    });
    const service = new ScimService({
        ...ScimServiceArgumentsMock,
        commercialFeatureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled }),
        } as never,
        groupsModel: groupsModel as never,
    });
    const operations = {
        replace: () =>
            service.replaceGroup(account, organizationUuid, group.uuid, {
                schemas: [ScimSchemaType.GROUP],
                displayName: group.name,
                members: [{ value: 'member' }],
            }),
        patch: () =>
            service.updateGroup(account, organizationUuid, group.uuid, {
                schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
                Operations: [
                    {
                        op: 'add',
                        path: 'members',
                        value: [{ value: 'member' }],
                    },
                ],
            }),
        delete: () =>
            service.deleteGroup(account, organizationUuid, group.uuid),
    };
    const runAsAgent = (operation: keyof typeof operations) =>
        agentExecutionContext.run(
            createAgentExecutionContext({
                account,
                surface: AgentActorSurface.CLI,
                clientId: 'lightdash-cli',
                agentUuid: null,
                agentIdentityEnabled: enabled,
            }),
            async () => operations[operation](),
        );
    return { account, group, groupsModel, operations, runAsAgent };
};

afterEach(() => vi.restoreAllMocks());

describe.each(['managed', 'admission', 'people-only'] as const)(
    'SCIM policy changes in %s mode',
    (mode) => {
        test.each(['replace', 'patch', 'delete'] as const)(
            'refuses agent %s before persistence',
            async (operation) => {
                const f = setup(mode);
                await expect(f.runAsAgent(operation)).rejects.toBeInstanceOf(
                    AiAccessRefusedError,
                );
                expect(f.groupsModel.updateGroup).not.toHaveBeenCalled();
                expect(f.groupsModel.deleteGroup).not.toHaveBeenCalled();
            },
        );

        test.each(['replace', 'patch', 'delete'] as const)(
            'audits provisioning %s',
            async (operation) => {
                const f = setup(mode);
                const audit = vi
                    .spyOn(auditLogger, 'logAuditEvent')
                    .mockImplementation(() => {});
                await f.operations[operation]();
                expect(audit).toHaveBeenCalledWith(
                    expect.objectContaining({
                        actor: expect.objectContaining({
                            type: 'service-account',
                            uuid: 'scim-actor',
                        }),
                        resource: expect.objectContaining({
                            metadata: expect.objectContaining({
                                event: 'group.membership_changed',
                                groupUuid: f.group.uuid,
                            }),
                        }),
                    }),
                );
            },
        );

        test.each(['replace', 'patch', 'delete'] as const)(
            'preserves flag-off %s',
            async (operation) => {
                const f = setup(mode, false);
                await f.runAsAgent(operation);
                expect(
                    AgentCapabilityPolicyModel.prototype.get,
                ).not.toHaveBeenCalled();
            },
        );
    },
);

import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusedError,
    OrganizationMemberRole,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import { parseAgentWorkMarker } from '../../../services/AgentPermissionService/agentWorkAuthority';
import {
    WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
    WritebackAgentAccessError,
} from './errors';
import { createWritebackAgentDeliveryGuard } from './writebackAgentWork';

it.each([
    { kind: 'mcp_tool' as const, key: 'run_ai_writeback' },
    { kind: 'agent_tool' as const, key: 'editDbtProject' },
])(
    'requires DbtWriteback for $key through the real policy service',
    async (operation) => {
        const marker = {
            userUuid: defaultSessionUser.userUuid,
            organizationUuid: defaultSessionUser.organizationUuid!,
            projectUuid: 'project',
        };
        const policy = {
            mode: 'managed' as const,
            version: 1,
            allowedProjectUuids: null,
            allowedUserUuids: null,
            allowedGroupUuids: null,
            storedAllowedGroupUuids: null,
            hasExistingAllowedGroup: null,
            systemRoleMatrix: agentSystemRoleMatrix([]),
        };
        const userModel = {
            findSessionUserAndOrgByUuid: vi
                .fn()
                .mockResolvedValue(defaultSessionUser),
            findServiceAccountByUserUuid: vi.fn(),
            getAgentRoleAssignments: vi.fn().mockResolvedValue({
                systemRoles: [OrganizationMemberRole.VIEWER],
                customRoles: [],
            }),
        };
        const agentActionLogModel = { insert: vi.fn() };
        const agentPermissionService = new AgentPermissionService({
            resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
            groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
            areGroupsAvailable: vi.fn().mockResolvedValue(true),
            isCustomRolesLicensed: vi.fn().mockReturnValue(true),
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            },
            agentCapabilityPolicyModel: {
                get: vi.fn().mockResolvedValue(policy),
                getForEnforcement: vi.fn().mockResolvedValue(policy),
                save: vi.fn(),
            },
            userModel,
            projectModel: {
                getSummary: vi.fn().mockResolvedValue({
                    organizationUuid: marker.organizationUuid,
                }),
            },
            getOrganizationSettings: vi.fn().mockResolvedValue({
                mcpAgentsEnabled: true,
                mcpContentWritesEnabled: true,
            }),
            agentActionLogModel,
        });
        const guard = createWritebackAgentDeliveryGuard(
            { userModel, agentPermissionService, agentActionLogModel },
            parseAgentWorkMarker({ ...marker, agentWork: marker }),
            {
                surface: AgentActorSurface.MCP,
                operation,
                agentPermissionsApply: true,
            },
        )!;
        await expect(guard.assert()).rejects.toMatchObject({
            message: WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
            isRefusal: true,
            originalError: expect.any(AiAccessRefusedError),
        });
        const failure = guard.getFailure()!.error as WritebackAgentAccessError;
        expect(failure.originalError).toMatchObject({
            refusal: {
                capability: AgentCapability.DbtWriteback,
                operation: operation.key,
            },
        });
        policy.systemRoleMatrix.viewer = [AgentCapability.DbtWriteback];
        await expect(guard.assert()).rejects.toBe(failure);
        expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(1);
    },
);

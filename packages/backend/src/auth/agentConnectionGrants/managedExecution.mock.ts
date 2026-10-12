import {
    AgentCapability,
    OrganizationMemberRole,
    type AgentCapabilityPolicy,
    type AgentConnectionExecution,
} from '@lightdash/common';
import { vi } from 'vitest';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../services/AgentPermissionService/AgentPermissionService';
import { defaultSessionUser } from '../account/account.mock';
import { AgentConnectionGrantService } from './AgentConnectionGrantService';
import { grantFixture } from './grant.mock';

export const managedExecutionFixture = () => {
    const grant = {
        ...grantFixture(),
        clientId: 'lightdash-cli',
        approvedCapabilities: Object.values(AgentCapability),
    };
    const user = {
        ...defaultSessionUser,
        userUuid: grant.subjectUserUuid,
        organizationUuid: grant.organizationUuid,
    };
    const projectUuid = grant.approvedProjectUuids[0];
    const execution: AgentConnectionExecution = {
        grantUuid: grant.grantUuid,
        revision: grant.grantRevision,
        subjectUserUuid: user.userUuid,
        organizationUuid: grant.organizationUuid,
        clientId: grant.clientId,
        resource: grant.resource,
        refreshFamilyUuid: grant.refreshFamilyUuid!,
        scopes: ['read', 'write'],
        operation: { kind: 'rest', key: 'ProjectController.refresh' },
    };
    const policy: AgentCapabilityPolicy = {
        mode: 'managed',
        version: 1,
        allowedCapabilities: null,
        allowedGroupUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix(Object.values(AgentCapability)),
    };
    const assignments = {
        systemRoles: [OrganizationMemberRole.VIEWER],
        customRoles: [] as { roleUuid: string; scopes: string[] }[],
    };
    const permissions = new AgentPermissionService({
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(projectUuid),
        isCustomRolesLicensed: () => true,
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
        areGroupsAvailable: vi.fn().mockResolvedValue(true),
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        agentCapabilityPolicyModel: {
            get: vi.fn().mockResolvedValue(policy),
            getForEnforcement: vi.fn().mockImplementation(async () => ({
                ...policy,
                storedAllowedGroupUuids: policy.allowedGroupUuids,
                hasExistingAllowedGroup:
                    policy.allowedGroupUuids === null
                        ? null
                        : policy.allowedGroupUuids.length > 0,
            })),
            save: vi.fn(),
        },
        userModel: {
            getAgentRoleAssignmentsForProjects: vi.fn(),
            getAgentRoleAssignments: vi.fn().mockResolvedValue(assignments),
        },
        projectModel: {
            getSummaries: vi.fn(),
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: grant.organizationUuid,
            }),
        },

        agentActionLogModel: { insert: vi.fn() },
    });
    const service = new AgentConnectionGrantService({
        model: {
            findActive: vi.fn().mockResolvedValue(grant),
            touchLastUsed: vi.fn(),
        },
        featureFlags: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        },
        getAgentPermissionService: () => permissions,
        resourceResolver: {
            resolveProjectUuid: vi.fn().mockResolvedValue(projectUuid),
            resolveResourceProjectUuid: vi.fn().mockResolvedValue(projectUuid),
            resolveDeploySession: vi.fn(),
        },
    });
    return {
        service,
        permissions,
        policy,
        assignments,
        execution,
        grant,
        user,
        projectUuid,
    };
};

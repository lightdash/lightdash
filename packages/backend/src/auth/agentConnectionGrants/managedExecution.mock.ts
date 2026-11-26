import {
    AgentCapability,
    type AgentCapabilityPolicy,
    type AgentConnectionExecution,
} from '@lightdash/common';
import { vi } from 'vitest';
import { AgentPermissionService } from '../../services/AgentPermissionService/AgentPermissionService';
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
        version: 1,
        allowedCapabilities: Object.values(AgentCapability),
        allowedGroupUuids: null,
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
    };
    const projectModel = {
        getAllByOrganizationUuid: vi.fn(),
        getSummary: vi
            .fn()
            .mockResolvedValue({ organizationUuid: grant.organizationUuid }),
        getSummaries: vi.fn().mockImplementation(async (projects: string[]) =>
            projects.map((uuid) => ({
                projectUuid: uuid,
                organizationUuid: grant.organizationUuid,
            })),
        ),
    };
    const permissions = new AgentPermissionService({
        resolveResourceProjectUuid: vi.fn().mockResolvedValue(projectUuid),
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
            getProjectPolicies: vi.fn().mockResolvedValue([]),
            saveProjectPolicy: vi.fn(),
            deleteProjectPolicy: vi.fn(),
        },
        projectModel,

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
        userModel,
        projectModel,
        policy,
        execution,
        grant,
        user,
        projectUuid,
    };
};

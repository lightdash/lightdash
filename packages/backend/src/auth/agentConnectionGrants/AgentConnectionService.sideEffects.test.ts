import { Ability } from '@casl/ability';
import {
    AgentCapability,
    FeatureFlags,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import knex from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import * as audit from '../../logging/winston';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import * as flagChecks from '../../models/FeatureFlagModel/flagCheckAggregator';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../services/AgentPermissionService/AgentPermissionService';
import { fromSession } from '../account/account';
import { defaultSessionUser } from '../account/account.mock';
import { AgentConnectionService } from './AgentConnectionService';
import { grantFixture } from './grant.mock';

afterEach(() => {
    vi.restoreAllMocks();
});

describe.each([true, false])('audit level enabled: %s', (auditEnabled) => {
    it.each([
        { refused: false, projectCount: 1 },
        { refused: true, projectCount: 1 },
        { refused: true, projectCount: 50 },
    ])(
        'status writes nothing with $projectCount projects, policy refused: $refused',
        async ({ refused, projectCount }) => {
            const capabilities = [
                AgentCapability.Query,
                AgentCapability.RawSql,
                AgentCapability.ReadDiscover,
            ];
            const auditEvent = vi
                .spyOn(audit, 'logAuditEvent')
                .mockImplementation(() => {});
            vi.spyOn(Logger, 'isLevelEnabled').mockReturnValue(auditEnabled);
            vi.spyOn(Logger, 'child').mockReturnValue(Logger);
            const debug = vi.spyOn(Logger, 'debug').mockReturnValue(Logger);
            const warn = vi.spyOn(Logger, 'warn').mockReturnValue(Logger);
            const error = vi.spyOn(Logger, 'error').mockReturnValue(Logger);
            const flagRecord = vi
                .spyOn(flagChecks, 'record')
                .mockImplementation(() => {});
            const grant = {
                ...grantFixture(),
                approvedCapabilities: capabilities,
                approvedProjectUuids: Array.from(
                    { length: projectCount },
                    (_, index) =>
                        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                ),
            };
            const originalGrant = structuredClone(grant);
            const projectUuid = grant.approvedProjectUuids[0];
            const user: SessionUser = {
                ...defaultSessionUser,
                userUuid: grant.subjectUserUuid,
                organizationUuid: grant.organizationUuid,
                ability: new Ability([{ action: 'manage', subject: 'all' }]),
            };
            const account = fromSession(user, '');
            const assignments = {
                systemRoles: [OrganizationMemberRole.VIEWER],
                customRoles: [],
            };
            const projects = grant.approvedProjectUuids.map((uuid) => ({
                projectUuid: uuid,
                organizationUuid: grant.organizationUuid,
                name: 'Visible project',
            }));
            const userModel = {
                findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
                getAgentRoleAssignments: vi.fn().mockResolvedValue(assignments),
                getAgentRoleAssignmentsForProjects: vi
                    .fn()
                    .mockResolvedValue(
                        new Map(
                            grant.approvedProjectUuids.map((uuid) => [
                                uuid,
                                assignments,
                            ]),
                        ),
                    ),
            };
            const projectModel = {
                getAllByOrganizationUuid: vi.fn().mockResolvedValue(projects),
                getSummary: vi
                    .fn()
                    .mockImplementation(async (uuid) =>
                        projects.find(
                            (project) => project.projectUuid === uuid,
                        ),
                    ),
                getSummaries: vi.fn().mockResolvedValue(projects),
            };
            const database = knex({ client: 'pg' });
            const featureFlags = new FeatureFlagModel({
                database,
                lightdashConfig: {
                    ...lightdashConfigMock,
                    enabledFeatureFlags: new Set([FeatureFlags.AgentIdentity]),
                    previewFeatureFlags: { enabled: false },
                },
            });
            const agentActionLogModel = {
                insert: vi.fn().mockResolvedValue(undefined),
            };
            const policy = {
                mode: 'managed' as const,
                version: 1,
                allowedCapabilities: null,
                allowedGroupUuids: null,
                storedAllowedGroupUuids: null,
                hasExistingAllowedGroup: null,
                systemRoleMatrix: agentSystemRoleMatrix(
                    capabilities.filter(
                        (capability) =>
                            !refused || capability !== AgentCapability.RawSql,
                    ),
                ),
            };
            const permissions = new AgentPermissionService({
                resolveResourceProjectUuid: vi
                    .fn()
                    .mockResolvedValue(projectUuid),
                isCustomRolesLicensed: () => true,
                areGroupsAvailable: vi.fn().mockResolvedValue(true),
                groupsModel: {
                    findUserInGroups: vi.fn().mockResolvedValue([]),
                },
                featureFlagModel: featureFlags,
                agentCapabilityPolicyModel: {
                    get: vi.fn().mockResolvedValue(policy),
                    getForEnforcement: vi.fn().mockResolvedValue(policy),
                    save: vi.fn(),
                },
                userModel,
                projectModel,
                agentActionLogModel,
            });
            const model = {
                find: vi.fn().mockResolvedValue(grant),
                listForSubject: vi.fn().mockResolvedValue([grant]),
                revoke: vi.fn(),
                touchLastUsed: vi.fn(),
            };
            const bulk = vi.spyOn(permissions, 'evaluateOperations');
            const single = vi.spyOn(permissions, 'assertOperation');
            const service = new AgentConnectionService({
                model,
                userModel,
                projectModel,
                featureFlags,
                getAgentPermissionService: () => permissions,
            });
            try {
                const status = await service.status(account, grant.grantUuid);
                expect(status.effectiveProjects).toEqual(
                    grant.approvedProjectUuids.map((uuid) => ({
                        projectUuid: uuid,
                        capabilities: capabilities.map((capability) => ({
                            capability,
                            allowed: !(
                                refused && capability === AgentCapability.RawSql
                            ),
                            reason:
                                refused && capability === AgentCapability.RawSql
                                    ? 'agent_policy'
                                    : null,
                        })),
                    })),
                );
                expect(bulk).toHaveBeenCalledExactlyOnceWith(
                    {
                        account: expect.objectContaining({
                            user: expect.objectContaining({
                                id: grant.subjectUserUuid,
                            }),
                        }),
                        organizationUuid: grant.organizationUuid,
                        surface: 'cli',
                        operations: grant.approvedProjectUuids.flatMap((uuid) =>
                            capabilities.map((key) => ({
                                projectUuid: uuid,
                                kind: 'capability',
                                key,
                            })),
                        ),
                    },
                    { userModel, projectModel },
                );
                expect(single).not.toHaveBeenCalled();
                expect(agentActionLogModel.insert).not.toHaveBeenCalled();
                const refusalEvents = auditEvent.mock.calls.filter(
                    ([event]) =>
                        event.resource.metadata?.event ===
                        'agent_action.refused',
                );
                expect(refusalEvents).toHaveLength(0);
                expect(auditEvent).toHaveBeenCalledTimes(
                    auditEnabled
                        ? projectCount * (1 + 3 * capabilities.length)
                        : 0,
                );
                expect(debug).toHaveBeenCalledTimes(
                    2 + 2 * projectCount * capabilities.length,
                );
                expect(flagRecord).toHaveBeenCalledTimes(3);
                expect(flagRecord).toHaveBeenCalledWith(
                    FeatureFlags.AgentIdentity,
                    grant.organizationUuid,
                    true,
                );
                expect(model.revoke).not.toHaveBeenCalled();
                expect(model.touchLastUsed).not.toHaveBeenCalled();
                expect(grant).toEqual(originalGrant);
                expect(warn).not.toHaveBeenCalled();
                expect(error).not.toHaveBeenCalled();
            } finally {
                await database.destroy();
            }
        },
    );
});

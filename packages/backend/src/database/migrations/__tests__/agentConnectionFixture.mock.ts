import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    AgentCapability,
    DbtProjectType,
    FeatureFlags,
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AgentConnectionExecution,
    type AgentSystemRoleMatrix,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { AgentConnectionGrantService } from '../../../auth/agentConnectionGrants/AgentConnectionGrantService';
import { AgentConnectionService } from '../../../auth/agentConnectionGrants/AgentConnectionService';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiOrganizationSettingsModel } from '../../../ee/models/AiOrganizationSettingsModel';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AgentCapabilityPolicyModel } from '../../../models/AgentCapabilityPolicyModel';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OAuth2Model } from '../../../models/OAuth2Model';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { AgentPermissionService } from '../../../services/AgentPermissionService/AgentPermissionService';
import { OAuthService } from '../../../services/OAuthService/OAuthService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const clientId = AGENT_CLIENT_IDS[AgentActorSurface.CLI];
const operationKey = 'ProjectController.getProject';
const capability = AgentCapability.ReadDiscover;
export const connectionTestConfig = {
    ...lightdashConfigMock,
    lightdashSecrets: {
        active: process.env.LIGHTDASH_SECRET!,
        fallbacks: [],
        all: [process.env.LIGHTDASH_SECRET!],
    },
    auth: {
        ...lightdashConfigMock.auth,
        oauthServer: {
            accessTokenLifetime: 3600,
            refreshTokenLifetime: 86400,
            mobileRefreshTokenLifetime: 86400,
            refreshTokenRotationGrace: 0,
        },
    },
};
export const encryptionUtil = new EncryptionUtil({
    lightdashConfig: connectionTestConfig,
});
export const matrix = (
    capabilities: AgentCapability[],
): AgentSystemRoleMatrix => ({
    member: [],
    viewer: capabilities,
    interactive_viewer: [],
    editor: [],
    developer: [],
    admin: [],
});
const unusedDependency = async (): Promise<never> => {
    throw new Error('This contract must use an explicit project');
};
export const seedConnectionClient = async (database: Knex) => {
    await database('oauth2_clients')
        .insert({
            client_id: clientId,
            client_name: 'Revocation contract CLI',
            redirect_uris: ['http://localhost:8080/callback'],
            grants: ['authorization_code', 'refresh_token'],
            scopes: ['read', 'write'],
        })
        .onConflict('client_id')
        .ignore();
};

export const connectionFixture = async (
    database: Knex,
    existingOrganizationUuid?: string,
) => {
    const [organization] = existingOrganizationUuid
        ? await database('organizations').where(
              'organization_uuid',
              existingOrganizationUuid,
          )
        : await database('organizations')
              .insert({ organization_name: 'Revocation contract' })
              .returning('*');
    const [user] = await database('users')
        .insert({
            first_name: 'Contract',
            last_name: 'Person',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    const organizationUuid = organization.organization_uuid;
    const userUuid = user.user_uuid;
    await database('organization_memberships').insert({
        organization_id: organization.organization_id,
        user_id: user.user_id,
        role: OrganizationMemberRole.MEMBER,
    });
    await database('emails').insert({
        user_id: user.user_id,
        email: `${userUuid}@example.com`,
        is_primary: true,
    });
    await database('emails')
        .where('user_id', user.user_id)
        .update({ is_verified: true });
    const createProject = async () => {
        const [project] = await database('projects')
            .insert({
                organization_id: organization.organization_id,
                name: 'Contract project',
                project_type: ProjectType.DEFAULT,
                created_by_user_uuid: userUuid,
                dbt_connection: encryptionUtil.encrypt(
                    JSON.stringify({ type: DbtProjectType.NONE }),
                ),
                dbt_connection_type: DbtProjectType.NONE,
                copied_from_project_uuid: null,
                dbt_version: '1.7',
                organization_warehouse_credentials_uuid: null,
            })
            .returning('*');
        await database('project_memberships').insert({
            project_id: project.project_id,
            user_id: user.user_id,
            role: ProjectMemberRole.VIEWER,
        });
        return project.project_uuid;
    };
    const projectUuid = await createProject();
    const flags: Pick<FeatureFlagModel, 'get'> = {
        get: async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId === FeatureFlags.AgentIdentity,
        }),
    };
    const users = new UserModel({
        database,
        lightdashConfig: connectionTestConfig,
        featureFlagModel: new FeatureFlagModel({
            database,
            lightdashConfig: connectionTestConfig,
        }),
    });
    const projects = new ProjectModel({
        database,
        lightdashConfig: connectionTestConfig,
        encryptionUtil,
    });
    const groups = new GroupsModel({ database });
    const policies = new AgentCapabilityPolicyModel({ database });
    const settings = new AiOrganizationSettingsModel({
        database,
        encryptionUtil,
    });
    const grants = new AgentConnectionGrantModel({ database });
    const credentials = new UserWarehouseCredentialsModel({
        database,
        encryptionUtil,
    });
    const permissions = new AgentPermissionService({
        agentCapabilityPolicyModel: policies,
        groupsModel: groups,
        featureFlagModel: flags,
        userModel: users,
        projectModel: projects,
        agentActionLogModel: new AgentActionLogModel({ database }),
        resolveResourceProjectUuid: unusedDependency,
        isCustomRolesLicensed: () => false,
        areGroupsAvailable: unusedDependency,
    });
    const connections = new AgentConnectionService({
        model: grants,
        userModel: users,
        projectModel: projects,
        featureFlags: flags,
        getAgentPermissionService: () => permissions,
    });
    const executions = new AgentConnectionGrantService({
        model: grants,
        userModel: users,
        featureFlags: flags,
        getAgentPermissionService: () => permissions,
        resourceResolver: {
            resolveProjectUuid: unusedDependency,
            resolveResourceProjectUuid: unusedDependency,
            resolveDeploySession: unusedDependency,
        },
    });
    const oauthModel = new OAuth2Model(database, connectionTestConfig, flags);
    const oauth = new OAuthService({
        oauthModel,
        userModel: users,
        lightdashConfig: connectionTestConfig,
    });
    const policy = await policies.save({
        organizationUuid,
        mode: 'managed',
        allowedCapabilities: Object.values(AgentCapability),
        allowedGroupUuids: null,
        systemRoleMatrix: matrix([capability]),
        updatedByUserUuid: userUuid,
    });
    await settings.upsert(organizationUuid, { mcpAgentsEnabled: true });
    const account = fromSession(
        await users.findSessionUserAndOrgByUuid(userUuid, organizationUuid),
        '',
    );
    const operation = {
        account,
        organizationUuid,
        projectUuid,
        kind: 'rest_operation' as const,
        key: operationKey,
        surface: AgentActorSurface.CLI,
    };
    const check = async () =>
        permissions.assertOperationWithRequest({
            request: await permissions.loadRequest(organizationUuid),
            operation,
        });
    const savePolicy = (changes: Partial<typeof policy>) =>
        policies.save({
            ...policy,
            ...changes,
            version: undefined,
            organizationUuid,
            updatedByUserUuid: userUuid,
        });
    const createConnection = async (
        capabilities = [capability],
        projectUuids = [projectUuid],
    ) => {
        const grant = await grants.create({
            organizationUuid,
            subjectUserUuid: userUuid,
            clientId,
            name: 'Contract CLI',
            resource: connectionTestConfig.siteUrl,
            approvedCapabilities: capabilities,
            approvedProjectUuids: projectUuids,
            resourceConstraints: {
                version: 2,
                projectCapabilities: Object.fromEntries(
                    projectUuids.map((uuid) => [uuid, capabilities]),
                ),
            },
            approvalPolicyVersion: policy.version,
            approvedByUserUuid: userUuid,
            approvalRequestUuid: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
        });
        const familyUuid = randomUUID();
        await grants.bindRefreshFamily({
            organizationUuid,
            grantUuid: grant.grantUuid,
            familyUuid,
        });
        const accessToken = randomUUID();
        const refreshToken = randomUUID();
        const tokenFields = {
            client_id: clientId,
            user_id: user.user_id,
            organization_uuid: organizationUuid,
            scope: ['read', 'write'],
            resource: grant.resource,
            family_uuid: familyUuid,
            agent_connection_grant_uuid: grant.grantUuid,
            expires_at: new Date(Date.now() + 3600000),
        };
        await database('oauth2_access_tokens').insert({
            ...tokenFields,
            access_token: accessToken,
        });
        await database('oauth2_refresh_tokens').insert({
            ...tokenFields,
            refresh_token: refreshToken,
        });
        const execution: AgentConnectionExecution = {
            grantUuid: grant.grantUuid,
            revision: grant.grantRevision,
            subjectUserUuid: userUuid,
            organizationUuid,
            clientId,
            resource: grant.resource,
            refreshFamilyUuid: familyUuid,
            scopes: tokenFields.scope,
            operation: { kind: 'rest', key: operationKey },
        };
        const execute = (
            targetProject = projectUuid,
            requiredCapabilities = [capability],
        ) =>
            executions.assertActiveExecution(execution, {
                projectUuid: targetProject,
                capabilities: requiredCapabilities,
                recheckOperation: true,
            });
        const refresh = async (token: string = refreshToken) => {
            const rotated = await oauth.token(
                new OAuth2Server.Request({
                    method: 'POST',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                        'transfer-encoding': 'chunked',
                    },
                    query: {},
                    body: {
                        client_id: clientId,
                        grant_type: 'refresh_token',
                        refresh_token: token,
                        resource: grant.resource,
                    },
                }),
                new OAuth2Server.Response({}),
            );
            if (!rotated.refreshToken) {
                throw new Error('Refresh exchange must return a refresh token');
            }
            expect(rotated.refreshToken).not.toBe(token);
            expect(rotated.accessToken).not.toBe(accessToken);
            return { ...rotated, refreshToken: rotated.refreshToken };
        };
        const authenticate = (token: string = accessToken) =>
            oauth.authenticate(
                new OAuth2Server.Request({
                    method: 'GET',
                    headers: { authorization: `Bearer ${token}` },
                    query: {},
                    body: {},
                }),
                new OAuth2Server.Response({}),
            );
        return {
            grant,
            accessToken,
            refreshToken,
            execute,
            refresh,
            authenticate,
        };
    };
    const saveCredentials = async () => {
        await credentials.upsertAiSnowflakeCredential(
            userUuid,
            'agent-refresh-token',
            null,
            { organizationUuid, clientVersion: randomUUID() },
            { strictPersonalOverlay: false },
        );
        await database('user_warehouse_credentials').insert({
            user_uuid: userUuid,
            name: 'Personal',
            warehouse_type: WarehouseTypes.SNOWFLAKE,
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify({
                    type: WarehouseTypes.SNOWFLAKE,
                    user: userUuid,
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    refreshToken: 'personal-refresh-token',
                }),
            ),
            project_uuid: null,
            purpose: UserWarehouseCredentialPurpose.DEFAULT,
            expires_at: null,
        });
        return database('user_warehouse_credentials')
            .where('user_uuid', userUuid)
            .orderBy('purpose');
    };
    return {
        database,
        user,
        executions,
        organization,
        organizationUuid,
        userUuid,
        projectUuid,
        users,
        projects,
        groups,
        policies,
        settings,
        grants,
        permissions,
        connections,
        oauthModel,
        oauth,
        account,
        operation,
        check,
        savePolicy,
        createProject,
        createConnection,
        saveCredentials,
    };
};

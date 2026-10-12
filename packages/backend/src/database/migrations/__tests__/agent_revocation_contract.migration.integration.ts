import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    FeatureFlags,
    ForbiddenError,
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
import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { fromSession } from '../../../auth/account/account';
import { AgentConnectionGrantService } from '../../../auth/agentConnectionGrants/AgentConnectionGrantService';
import { AgentConnectionService } from '../../../auth/agentConnectionGrants/AgentConnectionService';
import { OAuthBearerRefusalError } from '../../../auth/oauthScopes/security';
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
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

const clientId = AGENT_CLIENT_IDS[AgentActorSurface.CLI];
const operationKey = 'ProjectController.getProject';
const capability = AgentCapability.ReadDiscover;
const lightdashConfig = {
    ...lightdashConfigMock,
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
const encryptionUtil = new EncryptionUtil({ lightdashConfig });
const matrix = (capabilities: AgentCapability[]): AgentSystemRoleMatrix => ({
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
const captureError = async (operation: Promise<unknown>): Promise<unknown> => {
    try {
        await operation;
    } catch (error) {
        return error;
    }
    throw new Error('Expected the operation to refuse');
};
let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await migrated
        .database('oauth2_clients')
        .insert({
            client_id: clientId,
            client_name: 'Revocation contract CLI',
            redirect_uris: ['http://localhost:8080/callback'],
            grants: ['authorization_code', 'refresh_token'],
            scopes: ['read', 'write'],
        })
        .onConflict('client_id')
        .ignore();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [organization] = await database('organizations')
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
    const createProject = async () => {
        const [project] = await database('projects')
            .insert({
                organization_id: organization.organization_id,
                name: 'Contract project',
                project_type: ProjectType.DEFAULT,
                created_by_user_uuid: userUuid,
                dbt_connection: null,
                dbt_connection_type: null,
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
        lightdashConfig,
        featureFlagModel: new FeatureFlagModel({ database, lightdashConfig }),
    });
    const projects = new ProjectModel({
        database,
        lightdashConfig,
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
    const oauthModel = new OAuth2Model(database, lightdashConfig, flags);
    const oauth = new OAuthService({
        oauthModel,
        userModel: users,
        lightdashConfig,
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
    const createConnection = async () => {
        const grant = await grants.create({
            organizationUuid,
            subjectUserUuid: userUuid,
            clientId,
            name: 'Contract CLI',
            resource: lightdashConfig.siteUrl,
            approvedCapabilities: [capability],
            approvedProjectUuids: [projectUuid],
            resourceConstraints: {
                version: 2,
                projectCapabilities: { [projectUuid]: [capability] },
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
            capabilities = [capability],
        ) =>
            executions.assertActiveExecution(execution, {
                projectUuid: targetProject,
                capabilities,
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

test('MCP switches and historical people and project lists do not gate other surfaces', async () => {
    const f = await fixture();
    await f.settings.upsert(f.organizationUuid, {
        mcpAgentsEnabled: false,
        mcpContentWritesEnabled: false,
    });
    await f
        .database('organization_agent_capability_policies')
        .where('organization_uuid', f.organizationUuid)
        .update({
            allowed_user_uuids: [randomUUID()],
            allowed_project_uuids: [],
        });
    await Promise.all(
        [AgentActorSurface.IN_APP_AGENT, AgentActorSurface.SLACK_AGENT].map(
            async (surface) => {
                await expect(
                    f.permissions.assertOperation({
                        ...f.operation,
                        kind: 'agent_turn',
                        key: 'turn',
                        surface,
                    }),
                ).resolves.toBeUndefined();
            },
        ),
    );
    await expect(
        f.permissions.assertOperation({
            ...f.operation,
            surface: AgentActorSurface.API,
        }),
    ).resolves.toBeUndefined();
    await f.savePolicy({
        systemRoleMatrix: matrix([capability, AgentCapability.ContentWrite]),
    });
    await expect(
        f.permissions.assertOperation({
            ...f.operation,
            kind: 'capability',
            key: AgentCapability.ContentWrite,
            surface: AgentActorSurface.IN_APP_AGENT,
        }),
    ).resolves.toBeUndefined();
});

describe('Committed connection revocation', () => {
    it('refuses access, refresh and queued work immediately while a second CLI grant for the same person remains usable', async () => {
        const f = await fixture();
        const revoked = await f.createConnection();
        const unrelated = await f.createConnection();
        await Promise.all(
            [revoked, unrelated].map(async (connection) => {
                await expect(
                    f.oauthModel.getAccessToken(connection.accessToken),
                ).resolves.toMatchObject({
                    accessToken: connection.accessToken,
                });
                await expect(
                    f.oauthModel.getRefreshToken(connection.refreshToken),
                ).resolves.toMatchObject({
                    refreshToken: connection.refreshToken,
                });
                await expect(connection.execute()).resolves.toMatchObject({
                    grant: { grantUuid: connection.grant.grantUuid },
                });
            }),
        );
        const live = await revoked.refresh();
        await expect(
            f.oauthModel.getAccessToken(live.accessToken),
        ).resolves.toMatchObject({ accessToken: live.accessToken });
        await expect(
            f.oauthModel.getRefreshToken(live.refreshToken),
        ).resolves.toMatchObject({ refreshToken: live.refreshToken });
        await f.connections.revoke({
            grantUuid: revoked.grant.grantUuid,
            organizationUuid: f.organizationUuid,
            actor: f.account,
            reason: 'owner_revoked',
        });
        const accessError = await captureError(
            f.oauthModel.getAccessToken(live.accessToken),
        );
        expect(accessError).toBeInstanceOf(OAuthBearerRefusalError);
        expect(accessError).toMatchObject({
            name: 'invalid_token',
            message: 'Bearer tokens must use the Authorization header',
        });
        const refreshError = await captureError(
            revoked.refresh(live.refreshToken),
        );
        expect(refreshError).toBeInstanceOf(OAuth2Server.InvalidGrantError);
        expect(refreshError).toMatchObject({
            name: 'invalid_grant',
            message: 'Invalid grant: refresh token is invalid',
        });
        await expect(
            f.oauthModel.getRefreshToken(live.refreshToken),
        ).resolves.toBe(false);
        const executionError = await captureError(revoked.execute());
        expect(executionError).toBeInstanceOf(ForbiddenError);
        expect(executionError).toMatchObject({
            message:
                'This agent connection is no longer available for this operation.',
        });
        await expect(
            f.oauthModel.getAccessToken(unrelated.accessToken),
        ).resolves.toMatchObject({ accessToken: unrelated.accessToken });
        const rotated = await unrelated.refresh();
        await expect(
            f.oauthModel.getAccessToken(rotated.accessToken),
        ).resolves.toMatchObject({ accessToken: rotated.accessToken });
        await expect(unrelated.execute()).resolves.toMatchObject({
            grant: { grantUuid: unrelated.grant.grantUuid },
        });
    });
});

describe('OAuth token revocation limits', () => {
    it('revoking a bound refresh token ends its whole connection', async () => {
        const f = await fixture();
        const connection = await f.createConnection();
        const live = await connection.refresh();
        await expect(
            connection.authenticate(live.accessToken),
        ).resolves.toMatchObject({
            accessToken: live.accessToken,
        });
        await expect(connection.execute()).resolves.toBeDefined();
        await expect(f.oauth.revokeToken(live.refreshToken)).resolves.toBe(
            true,
        );
        await expect(
            f.grants.find(connection.grant.grantUuid),
        ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
        const authenticationError = await captureError(
            connection.authenticate(live.accessToken),
        );
        expect(authenticationError).toBeInstanceOf(OAuthBearerRefusalError);
        expect(authenticationError).toBeInstanceOf(
            OAuth2Server.InvalidTokenError,
        );
        expect(authenticationError).toMatchObject({
            name: 'invalid_token',
            message: 'Bearer tokens must use the Authorization header',
        });
        const accessError = await captureError(
            f.oauthModel.getAccessToken(live.accessToken),
        );
        expect(accessError).toBeInstanceOf(OAuthBearerRefusalError);
        expect(accessError).toMatchObject({
            name: 'invalid_token',
            message: 'Bearer tokens must use the Authorization header',
        });
        const refreshError = await captureError(
            connection.refresh(live.refreshToken),
        );
        expect(refreshError).toBeInstanceOf(OAuth2Server.InvalidGrantError);
        expect(refreshError).toMatchObject({
            name: 'invalid_grant',
            message: 'Invalid grant: refresh token is invalid',
        });
        const executionError = await captureError(connection.execute());
        expect(executionError).toBeInstanceOf(ForbiddenError);
        expect(executionError).toMatchObject({
            message:
                'This agent connection is no longer available for this operation.',
        });
    });
    it('known limit: revoking only a bound access token leaves the grant and refresh usable', async () => {
        const f = await fixture();
        const connection = await f.createConnection();
        await expect(connection.authenticate()).resolves.toMatchObject({
            accessToken: connection.accessToken,
        });
        await expect(connection.execute()).resolves.toBeDefined();
        await expect(f.oauth.revokeToken(connection.accessToken)).resolves.toBe(
            true,
        );
        const [{ expires_at: expiresAt }] = await migrated
            .database('oauth2_access_tokens')
            .select('expires_at')
            .where('access_token', connection.accessToken);
        vi.useFakeTimers({
            toFake: ['Date'],
            now: new Date(expiresAt).getTime() + 1,
        });
        try {
            const authenticationError = await captureError(
                connection.authenticate(),
            );
            expect(authenticationError).toBeInstanceOf(
                OAuth2Server.InvalidTokenError,
            );
            expect(authenticationError).toMatchObject({
                name: 'invalid_token',
                message: 'Invalid token: access token has expired',
            });
        } finally {
            vi.useRealTimers();
        }
        await expect(
            f.grants.findActive(connection.grant.grantUuid, new Date()),
        ).resolves.toMatchObject({
            grantUuid: connection.grant.grantUuid,
            revokedAt: null,
        });
        const rotated = await connection.refresh();
        await expect(
            f.oauthModel.getAccessToken(rotated.accessToken),
        ).resolves.toMatchObject({ accessToken: rotated.accessToken });
        await expect(connection.execute()).resolves.toBeDefined();
    });
});

describe('Fresh permission checks after committed narrowing', () => {
    it.each([
        ['project role', AiAccessRefusalReason.AGENT_CAPABILITY_DENIED],
        ['capability matrix', AiAccessRefusalReason.AGENT_CAPABILITY_DENIED],
        ['capability list', AiAccessRefusalReason.AGENT_CAPABILITY_DENIED],
        [
            'allowed group membership',
            AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
        ],
        ['empty capability list', AiAccessRefusalReason.AGENT_ACCESS_DISABLED],
    ] as const)(
        'refuses the next project-read check after narrowing %s',
        async (change, reason) => {
            const f = await fixture();
            const [group] = await f
                .database('groups')
                .insert({
                    organization_id: f.organization.organization_id,
                    name: 'Allowed contract group',
                    created_by_user_uuid: f.userUuid,
                    updated_by_user_uuid: f.userUuid,
                })
                .returning('*');
            const [membership] = await f.groups.addGroupMembers(
                group.group_uuid,
                [f.userUuid],
            );
            await f.savePolicy({ allowedGroupUuids: [group.group_uuid] });
            await expect(f.check()).resolves.toBeUndefined();
            switch (change) {
                case 'project role':
                    await f.projects.deleteProjectAccess(
                        f.projectUuid,
                        f.userUuid,
                    );
                    break;
                case 'capability matrix':
                    await f.savePolicy({
                        systemRoleMatrix: matrix([]),
                        allowedGroupUuids: [group.group_uuid],
                    });
                    break;
                case 'capability list':
                    await f.savePolicy({
                        allowedCapabilities: Object.values(
                            AgentCapability,
                        ).filter((value) => value !== capability),
                    });
                    break;
                case 'allowed group membership':
                    await expect(
                        f.groups.removeGroupMember(membership),
                    ).resolves.toBe(true);
                    break;
                case 'empty capability list':
                    await f.savePolicy({ allowedCapabilities: [] });
                    break;
                default:
                    assertUnreachable(change, 'Unknown narrowing change');
            }
            const permissionError = await captureError(f.check());
            expect(permissionError).toBeInstanceOf(AiAccessRefusedError);
            expect(permissionError).toMatchObject({
                refusal: { reason, operation: operationKey },
            });
        },
    );
    it('a retained handle keeps the capability list while the next request sees revocation', async () => {
        const f = await fixture();
        const request = await f.permissions.loadRequest(f.organizationUuid);
        const retainedCheck = () =>
            f.permissions.assertOperationWithRequest({
                request,
                operation: f.operation,
            });
        await expect(retainedCheck()).resolves.toBeUndefined();
        await f.savePolicy({
            allowedCapabilities: Object.values(AgentCapability).filter(
                (value) => value !== capability,
            ),
        });
        const permissionError = await captureError(f.check());
        expect(permissionError).toBeInstanceOf(AiAccessRefusedError);
        expect(permissionError).toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                operation: operationKey,
            },
        });
        await expect(retainedCheck()).resolves.toBeUndefined();
    });
});

describe('Stored grant approval after policy widening', () => {
    it('keeps the approved project and capabilities fixed when current policy permits more', async () => {
        const f = await fixture();
        const connection = await f.createConnection();
        await expect(connection.execute()).resolves.toBeDefined();
        const secondProjectUuid = await f.createProject();
        await f.savePolicy({
            systemRoleMatrix: matrix([capability, AgentCapability.Query]),
        });
        await expect(
            f.permissions.assertOperation({
                ...f.operation,
                projectUuid: secondProjectUuid,
            }),
        ).resolves.toBeUndefined();
        await expect(
            f.permissions.assertOperation({
                ...f.operation,
                kind: 'capability',
                key: AgentCapability.Query,
            }),
        ).resolves.toBeUndefined();
        const projectError = await captureError(
            connection.execute(secondProjectUuid),
        );
        expect(projectError).toBeInstanceOf(ForbiddenError);
        expect(projectError).toMatchObject({
            message:
                'This agent connection is no longer available for this operation.',
        });
        const capabilityError = await captureError(
            connection.execute(f.projectUuid, [AgentCapability.Query]),
        );
        expect(capabilityError).toBeInstanceOf(ForbiddenError);
        expect(capabilityError).toMatchObject({
            message:
                'This agent connection is no longer available for this operation.',
        });
        await expect(connection.execute()).resolves.toBeDefined();
    });
});

describe('Deactivation and transactional credential cleanup', () => {
    it('refuses a bound token and removes only the agent sign-in when the person is deactivated', async () => {
        const f = await fixture();
        const connection = await f.createConnection();
        const before = await f.saveCredentials();
        expect(before).toHaveLength(2);
        await expect(
            f.oauthModel.getAccessToken(connection.accessToken),
        ).resolves.toMatchObject({ accessToken: connection.accessToken });
        await f.users.updateUser(f.userUuid, undefined, { isActive: false });
        const accessError = await captureError(
            f.oauthModel.getAccessToken(connection.accessToken),
        );
        expect(accessError).toBeInstanceOf(OAuthBearerRefusalError);
        expect(accessError).toMatchObject({
            name: 'invalid_token',
            message: 'Bearer tokens must use the Authorization header',
        });
        expect(
            await f
                .database('user_warehouse_credentials')
                .where('user_uuid', f.userUuid),
        ).toEqual(
            before.filter(
                (row) => row.purpose === UserWarehouseCredentialPurpose.DEFAULT,
            ),
        );
        expect(
            await f.database('users').where('user_uuid', f.userUuid).first(),
        ).toMatchObject({ is_active: false });
    });
    it('rolls deactivation back when deleting the agent sign-in fails', async () => {
        const f = await fixture();
        const connection = await f.createConnection();
        const before = await f.saveCredentials();
        expect(before).toHaveLength(2);
        await expect(
            f.oauthModel.getAccessToken(connection.accessToken),
        ).resolves.toMatchObject({ accessToken: connection.accessToken });
        await f.database.raw(
            `CREATE FUNCTION fail_contract_sign_in_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'contract sign-in delete failed'; END $$`,
        );
        try {
            await f.database.raw(
                `CREATE TRIGGER fail_contract_sign_in_delete BEFORE DELETE ON user_warehouse_credentials FOR EACH ROW EXECUTE FUNCTION fail_contract_sign_in_delete()`,
            );
            const cleanupError = await captureError(
                f.users.updateUser(f.userUuid, undefined, { isActive: false }),
            );
            expect(cleanupError).toBeInstanceOf(DatabaseError);
            expect(cleanupError).toMatchObject({
                code: 'P0001',
                message: expect.stringContaining(
                    'contract sign-in delete failed',
                ),
            });
            expect(
                await f
                    .database('users')
                    .where('user_uuid', f.userUuid)
                    .first(),
            ).toMatchObject({ is_active: true });
            expect(
                await f
                    .database('user_warehouse_credentials')
                    .where('user_uuid', f.userUuid)
                    .orderBy('purpose'),
            ).toEqual(before);
            await expect(
                f.oauthModel.getAccessToken(connection.accessToken),
            ).resolves.toMatchObject({ accessToken: connection.accessToken });
        } finally {
            await f.database.raw(
                'DROP TRIGGER IF EXISTS fail_contract_sign_in_delete ON user_warehouse_credentials',
            );
            await f.database.raw(
                'DROP FUNCTION fail_contract_sign_in_delete()',
            );
        }
    });
});

describe('Person removal and credential ownership', () => {
    it('deletes bound grants, tokens and personal credentials but preserves a shared MCP credential with null authors', async () => {
        const f = await fixture();
        const connection = await f.createConnection();
        const live = await connection.refresh();
        await f.saveCredentials();
        const [server] = await f
            .database('ai_mcp_server')
            .insert({
                project_uuid: f.projectUuid,
                name: 'Contract MCP',
                url: 'https://mcp.example.com',
                auth_type: 'bearer',
                icon_url: null,
                allow_oauth_credential_sharing: false,
                connection_status: null,
                error: null,
            })
            .returning('*');
        const rows = await f
            .database('ai_mcp_server_credential')
            .insert(
                (['user', 'shared'] as const).map((scope) => ({
                    ai_mcp_server_uuid: server.ai_mcp_server_uuid,
                    credential_scope: scope,
                    user_uuid: scope === 'user' ? f.userUuid : null,
                    created_by_user_uuid: f.userUuid,
                    updated_by_user_uuid: f.userUuid,
                    encrypted_credentials: encryptionUtil.encrypt(
                        JSON.stringify({ token: 'contract-token' }),
                    ),
                })),
            )
            .returning('*');
        expect(rows).toHaveLength(2);
        await expect(
            f.oauthModel.getAccessToken(live.accessToken),
        ).resolves.toMatchObject({ accessToken: live.accessToken });
        await expect(connection.execute()).resolves.toBeDefined();
        await f.users.delete(f.userUuid);
        expect(
            await f.database('users').where('user_uuid', f.userUuid),
        ).toEqual([]);
        await expect(
            f.grants.find(connection.grant.grantUuid),
        ).resolves.toBeNull();
        expect(
            await f
                .database('oauth2_access_tokens')
                .where('access_token', live.accessToken),
        ).toEqual([]);
        expect(
            await f
                .database('oauth2_refresh_tokens')
                .where('refresh_token', live.refreshToken),
        ).toEqual([]);
        expect(
            await f
                .database('user_warehouse_credentials')
                .where('user_uuid', f.userUuid),
        ).toEqual([]);
        expect(
            await f
                .database('ai_mcp_server_credential')
                .where('ai_mcp_server_uuid', server.ai_mcp_server_uuid),
        ).toEqual([
            {
                ...rows.find((row) => row.credential_scope === 'shared'),
                created_by_user_uuid: null,
                updated_by_user_uuid: null,
            },
        ]);
        await expect(
            f.oauthModel.getAccessToken(live.accessToken),
        ).resolves.toBe(false);
        const refreshError = await captureError(
            connection.refresh(live.refreshToken),
        );
        expect(refreshError).toBeInstanceOf(OAuth2Server.InvalidGrantError);
        expect(refreshError).toMatchObject({
            name: 'invalid_grant',
            message: 'Invalid grant: refresh token is invalid',
        });
        const executionError = await captureError(connection.execute());
        expect(executionError).toBeInstanceOf(ForbiddenError);
        expect(executionError).toMatchObject({
            message:
                'This agent connection is no longer available for this operation.',
        });
    });
});

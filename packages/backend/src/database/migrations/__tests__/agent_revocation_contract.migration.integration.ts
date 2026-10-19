import {
    AgentActorSurface,
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    ForbiddenError,
    UserWarehouseCredentialPurpose,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { OAuthBearerRefusalError } from '../../../auth/oauthScopes/security';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    connectionFixture,
    encryptionUtil,
    matrix,
    seedConnectionClient,
} from './agentConnectionFixture.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

const operationKey = 'ProjectController.getProject';
const capability = AgentCapability.ReadDiscover;
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
    await seedConnectionClient(migrated.database);
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = () => connectionFixture(migrated.database);

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
                        key: 'agent_turn',
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

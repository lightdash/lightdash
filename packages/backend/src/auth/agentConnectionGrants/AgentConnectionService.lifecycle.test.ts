import { AgentCapability } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AgentConnectionGrantModel } from '../../models/AgentConnectionGrantModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type UserModel } from '../../models/UserModel';
import { OAuthService } from '../../services/OAuthService/OAuthService';
import { fromSession } from '../account/account';
import { AgentConnectionGrantService } from './AgentConnectionGrantService';
import { AgentConnectionService } from './AgentConnectionService';
import { managedExecutionFixture } from './managedExecution.mock';

it.each(['owner', 'refresh_revoke', 'refresh_reuse'] as const)(
    'refuses access, refresh and queued effects after %s through the shared lifecycle',
    async (cause) => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const tracker = getTracker();
        const f = managedExecutionFixture();
        const row = {
            agent_connection_grant_uuid: f.grant.grantUuid,
            organization_uuid: f.grant.organizationUuid,
            subject_user_uuid: f.grant.subjectUserUuid,
            client_id: f.grant.clientId,
            credential_kind: 'oauth',
            actor_kind: 'agent',
            name: 'cli',
            resource: f.grant.resource,
            refresh_family_uuid: f.grant.refreshFamilyUuid,
            approved_capabilities: f.grant.approvedCapabilities,
            approved_project_uuids: f.grant.approvedProjectUuids,
            resource_constraints: f.grant.resourceConstraints,
            grant_contract_version: 1,
            grant_revision: 1,
            approved_at: f.grant.approvedAt,
            expires_at: f.grant.expiresAt,
            revoked_at: null as Date | null,
            revoked_by_user_uuid: null as string | null,
            revocation_reason: null as string | null,
        };
        const tokenRow = {
            access_token: 'access',
            refresh_token: 'refresh',
            expires_at: f.grant.expiresAt,
            revoked_at: null as Date | null,
            client_id: f.grant.clientId,
            user_id: f.user.userId,
            user_uuid: f.user.userUuid,
            organization_uuid: f.grant.organizationUuid,
            resource: f.grant.resource,
            family_uuid: f.grant.refreshFamilyUuid,
            agent_connection_grant_uuid: 'grant',
            scope: ['read', 'write'],
        };
        tracker.on.any(/pg_advisory/).response([]);
        tracker.on.select('agent_connection_grants').response(() => row);
        tracker.on.select('oauth2_access_tokens').response(() => tokenRow);
        tracker.on.select('oauth2_refresh_tokens').response(() => tokenRow);
        tracker.on.select(/from "users"/).response({
            user_uuid: f.user.userUuid,
            organization_uuid: f.grant.organizationUuid,
            is_active: true,
        });
        tracker.on.update('agent_connection_grants').response((query) => {
            if (!row.revoked_at) {
                row.revoked_at = new Date();
                row.revoked_by_user_uuid =
                    cause === 'owner' ? f.user.userUuid : null;
                row.revocation_reason = cause;
            }
            expect(query.sql).toContain('coalesce(revoked_at, now())');
            return [row];
        });
        tracker.on.update('oauth2_refresh_tokens').response(() => {
            tokenRow.revoked_at ??= new Date();
            return 1;
        });
        tracker.on.delete('oauth2_authorization_codes').response(1);
        tracker.on.delete('oauth2_access_tokens').response(0);
        const model = new AgentConnectionGrantModel({ database });
        const revokeAtRoot = model.revoke.bind(model);
        const revoke = vi
            .spyOn(AgentConnectionGrantModel.prototype, 'revoke')
            .mockImplementation(revokeAtRoot);
        const flags = { get: vi.fn().mockResolvedValue({ enabled: true }) };
        const userModel = {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(f.user),
        };
        const service = new AgentConnectionService({
            model,
            featureFlags: flags,
            userModel,
            projectModel: { getAllByOrganizationUuid: vi.fn() },
            getAgentPermissionService: () => f.permissions,
        });
        const grantService = new AgentConnectionGrantService({
            model,
            featureFlags: flags,
            userModel,
            getAgentPermissionService: () => f.permissions,
            resourceResolver: {
                resolveProjectUuid: vi.fn(),
                resolveResourceProjectUuid: vi.fn(),
                resolveDeploySession: vi.fn(),
            },
        });
        const oauthModel = new OAuth2Model(
            database,
            lightdashConfigMock,
            flags,
        );
        const runJob = () =>
            grantService.assertActiveExecution(f.execution, {
                projectUuid: f.projectUuid,
                capabilities: [AgentCapability.ReadDiscover],
                recheckOperation: false,
            });
        try {
            await expect(
                oauthModel.getAccessToken('access'),
            ).resolves.toMatchObject({ agentConnectionGrantUuid: 'grant' });
            await expect(
                oauthModel.getRefreshToken('refresh'),
            ).resolves.toMatchObject({ agentConnectionGrantUuid: 'grant' });
            await expect(runJob()).resolves.toBeDefined();
            if (cause === 'owner')
                await service.revoke({
                    grantUuid: 'grant',
                    organizationUuid: 'org',
                    actor: fromSession(f.user, ''),
                    reason: 'owner_revoked',
                });
            else if (cause === 'refresh_revoke') {
                const oauth = new OAuthService({
                    oauthModel,
                    lightdashConfig: lightdashConfigMock,
                    userModel: {} as UserModel,
                });
                await expect(oauth.revokeToken('refresh')).resolves.toBe(true);
            } else {
                tokenRow.revoked_at = new Date();
                await expect(
                    oauthModel.getRefreshToken('refresh'),
                ).resolves.toBeFalsy();
            }
            expect(row.revoked_at).not.toBeNull();
            expect(revoke).toHaveBeenCalledWith(
                expect.objectContaining({
                    grantUuid: 'grant',
                    organizationUuid: 'org',
                    reason: {
                        owner: 'owner_revoked',
                        refresh_reuse: 'refresh_reuse',
                        refresh_revoke: 'refresh_token_revoked',
                    }[cause],
                }),
            );
            expect(
                tracker.history.delete.some((query) =>
                    query.sql.includes('oauth2_authorization_codes'),
                ),
            ).toBe(true);
            await expect(
                oauthModel.getAccessToken('access'),
            ).rejects.toMatchObject({ name: 'invalid_token' });
            await expect(
                oauthModel.getRefreshToken('refresh'),
            ).resolves.toBeFalsy();
            await expect(runJob()).rejects.toThrow();
        } finally {
            vi.restoreAllMocks();
            tracker.reset();
            await database.destroy();
        }
    },
);

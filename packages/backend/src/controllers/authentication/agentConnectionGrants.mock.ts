import { FeatureFlags } from '@lightdash/common';
import { type Request, type RequestHandler, type Response } from 'express';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { AgentConnectionGrantService } from '../../auth/agentConnectionGrants/AgentConnectionGrantService';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';

export const setupGrantAuthentication = (sessionUser = defaultSessionUser) => {
    const grant = grantFixture();
    grant.clientId = 'lightdash-cli';
    const user = {
        ...sessionUser,
    };
    grant.subjectUserUuid = user.userUuid;
    grant.organizationUuid = user.organizationUuid!;
    const token = {
        accessToken: 'token',
        scope: ['read'],
        agentConnectionGrantUuid: 'grant',
        familyUuid: 'family',
        resource: grant.resource,
        client: { id: grant.clientId },
        user,
    };
    const deps = {
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        },
        getAgentPermissionService: () => ({
            assertOperation: vi.fn().mockResolvedValue(undefined),
        }),
        model: {
            findActive: vi.fn().mockResolvedValue(grant),
            touchLastUsed: vi.fn().mockResolvedValue(undefined),
        },
        featureFlags: {
            get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
                enabled: featureFlagId === FeatureFlags.AgentIdentity,
            })),
        },
        resourceResolver: {
            resolveDeploySession: vi.fn().mockResolvedValue({
                projectUuid: grant.approvedProjectUuids[0],
                userUuid: user.userUuid,
            }),
            resolveProjectUuid: vi
                .fn()
                .mockImplementation(async (_org, uuid) => uuid),
            resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        },
    };
    const service = new AgentConnectionGrantService(deps);
    const permissions = {
        getEnforcementMode: vi.fn().mockResolvedValue('off'),
        isEnforced: vi.fn().mockResolvedValue(false),
        assertOperation: vi.fn(),
        resolveResourceProjectUuid: vi.fn(),
    };
    const handler = Object.defineProperty(() => {}, 'name', {
        value: 'ProjectController_getProject',
    });
    const oauth = {
        authenticate: vi.fn().mockResolvedValue(token),
        getSiteUrl: () => grant.resource,
        isAccessTokenBoundToGrant: vi.fn().mockResolvedValue(false),
    };
    const req = {
        headers: { authorization: 'Bearer token' },
        method: 'GET',
        query: {},
        body: {},
        params: { projectUuid: grant.approvedProjectUuids[0] },
        baseUrl: '',
        route: {
            path: '/api/v1/projects/:projectUuid',
            stack: [{ handle: handler }],
        },
        isAuthenticated: () => false,
        services: {
            getOauthService: () => oauth,
            getUserService: () => ({ findSessionUser: async () => user }),
            getFeatureFlagService: () => deps.featureFlags,
            getAgentPermissionService: () => permissions,
            getAgentConnectionGrantService: () => service,
        },
    } as unknown as Request;
    const downstream = vi.fn();
    let status = 200;
    const run = (middleware: RequestHandler) =>
        new Promise<{ status: number; body?: unknown; error?: unknown }>(
            (resolve, reject) => {
                status = 200;
                const res = {
                    locals: {},
                    status: (value: number) => {
                        status = value;
                        return res;
                    },
                    json: (body: unknown) => resolve({ status, body }),
                    set: vi.fn(),
                } as unknown as Response;
                req.res = res;
                middleware(req, res, (error) => {
                    if (error !== undefined) {
                        resolve({ status, error });
                        return;
                    }
                    try {
                        Promise.resolve(downstream()).then(
                            () => resolve({ status, error }),
                            reject,
                        );
                    } catch (downstreamError) {
                        reject(downstreamError);
                    }
                });
            },
        );
    return {
        grant,
        user,
        token,
        deps,
        service,
        permissions,
        req,
        run,
        oauth,
        downstream,
    };
};

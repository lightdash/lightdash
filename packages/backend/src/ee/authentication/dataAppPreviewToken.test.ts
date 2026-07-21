import {
    AuthorizationError,
    ForbiddenError,
    type SessionUser,
} from '@lightdash/common';
import type { NextFunction, Request, Response } from 'express';
import { lightdashConfig } from '../../config/lightdashConfig';
import { mintPreviewToken } from '../../routers/appPreviewToken';
import {
    authenticateDataAppPreviewToken,
    DATA_APP_PREVIEW_TOKEN_PREFIX,
    DATA_APP_PREVIEW_TOKEN_TTL_SECONDS,
    mintDataAppPreviewToken,
    verifyDataAppPreviewToken,
} from './dataAppPreviewToken';

const SECRET = lightdashConfig.lightdashSecret;
const USER_UUID = 'user-uuid-1';
const ORG_UUID = 'org-uuid-1';
const PROJECT_UUID = 'project-uuid-1';

const mintArgs = {
    userUuid: USER_UUID,
    organizationUuid: ORG_UUID,
    projectUuid: PROJECT_UUID,
};

describe('mintDataAppPreviewToken / verifyDataAppPreviewToken', () => {
    it('round-trips the payload and carries the prefix', () => {
        const { token, expiresAt } = mintDataAppPreviewToken(SECRET, mintArgs);
        expect(token.startsWith(DATA_APP_PREVIEW_TOKEN_PREFIX)).toBe(true);
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

        const result = verifyDataAppPreviewToken(token, SECRET);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.payload.userUuid).toBe(USER_UUID);
            expect(result.payload.organizationUuid).toBe(ORG_UUID);
            expect(result.payload.projectUuid).toBe(PROJECT_UUID);
        }
    });

    it('rejects a token signed with a different secret', () => {
        const { token } = mintDataAppPreviewToken('other-secret', mintArgs);
        expect(verifyDataAppPreviewToken(token, SECRET).ok).toBe(false);
    });

    it('rejects an app-asset preview token even with the prefix attached', () => {
        // Same root secret, different purpose-derived key + audience — the
        // two token families must never validate as each other.
        const assetToken = mintPreviewToken(
            SECRET,
            'app-uuid',
            1,
            USER_UUID,
            ORG_UUID,
            PROJECT_UUID,
        );
        const disguised = `${DATA_APP_PREVIEW_TOKEN_PREFIX}${assetToken}`;
        expect(verifyDataAppPreviewToken(disguised, SECRET).ok).toBe(false);
    });

    it('rejects garbage and unprefixed values', () => {
        expect(verifyDataAppPreviewToken('ldpat_something', SECRET).ok).toBe(
            false,
        );
        expect(
            verifyDataAppPreviewToken(
                `${DATA_APP_PREVIEW_TOKEN_PREFIX}not-a-jwt`,
                SECRET,
            ).ok,
        ).toBe(false);
    });

    it('rejects an expired token', () => {
        vi.useFakeTimers();
        try {
            const { token } = mintDataAppPreviewToken(SECRET, mintArgs);
            vi.advanceTimersByTime(
                (DATA_APP_PREVIEW_TOKEN_TTL_SECONDS + 60) * 1000,
            );
            expect(verifyDataAppPreviewToken(token, SECRET).ok).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('authenticateDataAppPreviewToken', () => {
    const sessionUser = {
        userId: 1,
        userUuid: USER_UUID,
        email: 'dev@example.com',
        firstName: 'Dev',
        lastName: 'User',
        organizationUuid: ORG_UUID,
        organizationName: 'Org',
        organizationCreatedAt: new Date(),
        isActive: true,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        isSetupComplete: true,
        role: 'admin',
        ability: { can: () => true, cannot: () => false },
        abilityRules: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    } as unknown as SessionUser;

    const buildReq = (
        overrides: Partial<{
            method: string;
            originalUrl: string;
            authorization: string | undefined;
        }> = {},
    ) => {
        const findSessionUser = vi.fn().mockResolvedValue(sessionUser);
        const { token } = mintDataAppPreviewToken(SECRET, mintArgs);
        const req = {
            method: overrides.method ?? 'POST',
            originalUrl:
                overrides.originalUrl ??
                `/api/v2/projects/${PROJECT_UUID}/query/metric-query`,
            headers: {
                authorization:
                    'authorization' in overrides
                        ? overrides.authorization
                        : `ApiKey ${token}`,
                'user-agent': 'vitest',
            },
            ip: '127.0.0.1',
            services: {
                getUserService: () => ({ findSessionUser }),
            },
        } as unknown as Request;
        return { req, findSessionUser };
    };

    const run = async (req: Request) => {
        const next = vi.fn() as NextFunction;
        await authenticateDataAppPreviewToken(req, {} as Response, next);
        return next as ReturnType<typeof vi.fn>;
    };

    it('authenticates a valid token on an allowed route', async () => {
        const { req, findSessionUser } = buildReq();
        const next = await run(req);
        expect(next).toHaveBeenCalledWith();
        expect(findSessionUser).toHaveBeenCalledWith({
            id: USER_UUID,
            organization: ORG_UUID,
        });
        expect(req.user).toBe(sessionUser);
        expect(req.account?.authentication?.type).toBe('pat');
    });

    it('rejects non-SDK routes without loading a user', async () => {
        const { req, findSessionUser } = buildReq({
            method: 'GET',
            originalUrl: '/api/v1/org/projects',
        });
        const next = await run(req);
        expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
        expect(findSessionUser).not.toHaveBeenCalled();
    });

    it('rejects SDK routes for a different project', async () => {
        const { req, findSessionUser } = buildReq({
            originalUrl: '/api/v2/projects/other-project/query/metric-query',
        });
        const next = await run(req);
        expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
        expect(findSessionUser).not.toHaveBeenCalled();
    });

    it('rejects an invalid token', async () => {
        const { req } = buildReq({
            authorization: `ApiKey ${DATA_APP_PREVIEW_TOKEN_PREFIX}garbage`,
        });
        const next = await run(req);
        expect(next.mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
    });

    it('rejects a malformed authorization header', async () => {
        const { req } = buildReq({ authorization: 'Bearer whatever' });
        const next = await run(req);
        expect(next.mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
    });
});

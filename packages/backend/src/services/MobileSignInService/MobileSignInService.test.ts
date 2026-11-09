import {
    ConflictError,
    ForbiddenError,
    LightdashMode,
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    NotFoundError,
    TooManyRequestsError,
    type SessionUser,
} from '@lightdash/common';
import { hashMobileAppLinkKey } from '../../models/MobileAppLinkModel';
import type { MobileSignInCodeModel } from '../../models/MobileSignInCodeModel';
import { MobileSignInOAuthError } from './MobileSignInOAuthError';
import { maskDisplayName, MobileSignInService } from './MobileSignInService';

const code = 'Q0RFLTAwMDAtdGVzdC0wMDAwLXRlc3QtMDAwMDAwMDA';
const challenge = 'Y2hhbGxlbmdlLTAwMDAtdGVzdC0wMDAwLXRlc3QtMDA';
const verifier = 'dmVyaWZpZXItMDAwMC10ZXN0LTAwMDAtdGVzdC0wMDAwMDAwMA';
const userUuid = 'user-0000-test';
const organizationUuid = 'org-0000-test';

const sessionUser = {
    userUuid,
    organizationUuid,
    firstName: 'Test',
    lastName: 'User',
    email: 'test-user@example.com',
    isActive: true,
    isEmailVerified: true,
} as SessionUser;

const codeRow = {
    mobile_sign_in_code_uuid: 'code-0000-test',
    user_uuid: userUuid,
    organization_uuid: organizationUuid,
    client_id: 'client-0000-test',
    reported_platform: 'ios',
    match_number: 7,
    expires_at: new Date(Date.now() + 300_000),
};

const createService = ({
    flagEnabled = true,
    qrSignInEnabled = true,
    mode = LightdashMode.CLOUD_BETA,
    managed = false,
    smtp = true,
    user = sessionUser,
    rateAllowed = true,
    model = {},
    client = {
        id: 'client-0000-test',
        redirectUris: ['com.lightdash.mobile://oauth/callback'],
    },
    now = () => new Date('2026-11-09T12:00:18.000Z'),
}: {
    now?: () => Date;
    flagEnabled?: boolean;
    qrSignInEnabled?: boolean;
    mode?: LightdashMode;
    managed?: boolean;
    smtp?: boolean;
    user?: SessionUser;
    rateAllowed?: boolean;
    model?: Partial<Record<keyof MobileSignInCodeModel, unknown>>;
    client?: Record<string, unknown> | false;
} = {}) => {
    const mobileSignInCodeModel = {
        findOwner: vi.fn(async () => ({
            user_uuid: userUuid,
            organization_uuid: organizationUuid,
            reported_platform: 'ios',
        })),
        mint: vi.fn(async () => ({
            codeUuid: 'code-0000-test',
            code,
            approvalNonce: 'nonce-0000-test',
            expiresAt: new Date(Date.now() + 120_000),
        })),
        ...model,
    } as unknown as MobileSignInCodeModel;
    const getManagedSignIn = vi.fn(async () =>
        managed ? ({ provider: 'microsoft' } as never) : undefined,
    );
    const counts = new Map<string, number>();
    const counterKey = (args: {
        keyHash: string;
        operation: string;
        windowStartedAt: Date;
    }) =>
        `${args.keyHash}|${args.operation}|${args.windowStartedAt.toISOString()}`;
    const incrementRateCounter = vi.fn(
        async (args: Parameters<typeof counterKey>[0]) => {
            if (!rateAllowed) return 1000;
            const next = (counts.get(counterKey(args)) ?? 0) + 1;
            counts.set(counterKey(args), next);
            return next;
        },
    );
    const getRateCount = vi.fn(async (args: Parameters<typeof counterKey>[0]) =>
        rateAllowed ? (counts.get(counterKey(args)) ?? 0) : 1000,
    );
    const track = vi.fn();
    const service = new MobileSignInService({
        analytics: { track },
        lightdashConfig: {
            siteUrl: 'https://app.example.test',
            smtp: smtp ? ({} as never) : undefined,
            mode,
            trustProxy: true,
        },
        mobileSignInCodeModel,
        mobileAppLinkModel: { incrementRateCounter, getRateCount },
        now,
        featureFlagModel: {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    id: featureFlagId,
                    enabled:
                        featureFlagId === 'mobile-qr-sign-in'
                            ? qrSignInEnabled
                            : flagEnabled,
                }),
            ),
        },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn(async () => user),
        },
        oauthModel: { getClient: vi.fn(async () => client as never) },
        getUserService: () => ({ getManagedSignIn }),
    });
    return {
        service,
        mobileSignInCodeModel,
        incrementRateCounter,
        getManagedSignIn,
        track,
    };
};

const expectRefusal = async (
    promise: Promise<unknown>,
    reason: MobileSignInRefusal,
) => {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).data).toMatchObject({ reason });
};

const expectOAuthError = async (
    promise: Promise<unknown>,
    expected: Record<string, unknown>,
) => {
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MobileSignInOAuthError);
    expect(error).toMatchObject(expected);
};

describe('maskDisplayName', () => {
    it('keeps two letters of the first name and the last initial', () => {
        expect(maskDisplayName('Test', 'User')).toBe('Te••• U.');
        expect(maskDisplayName('Jo', undefined)).toBe('Jo•••');
        expect(maskDisplayName('', '')).toBe('•••');
        expect(maskDisplayName('Émile', 'zola')).toBe('Ém••• Z.');
    });
});

describe('MobileSignInService.getClientAddress', () => {
    it('reads the client behind a trusted proxy hop', () => {
        const { service } = createService();
        expect(
            service.getClientAddress({
                socket: { remoteAddress: '10.0.0.5' },
                get: (name: string) =>
                    name === 'x-forwarded-for'
                        ? '198.51.100.9, 203.0.113.7'
                        : undefined,
            } as never),
        ).toBe('203.0.113.7');
    });
});

describe('MobileSignInService.mint', () => {
    it('returns a /m/sign-in link with the code in the fragment', async () => {
        const { service, mobileSignInCodeModel } = createService();
        const minted = await service.mint(sessionUser, 'session-0000', 'show');
        expect(minted.signInUrl).toBe(
            `https://app.example.test/m/sign-in#c=${code}`,
        );
        expect(minted.approvalNonce).toBe('nonce-0000-test');
        expect(minted.expiresInSeconds).toBeGreaterThan(100);
        expect(mobileSignInCodeModel.mint).toHaveBeenCalledWith({
            userUuid,
            organizationUuid,
            sessionId: 'session-0000',
        });
    });

    it('refuses a user with no organization', async () => {
        const { service } = createService();
        await expectRefusal(
            service.mint(
                { ...sessionUser, organizationUuid: undefined },
                'session-0000',
                'show',
            ),
            MobileSignInRefusal.ORGANIZATION_REQUIRED,
        );
    });

    it('refuses when the flag is off', async () => {
        const { service } = createService({ flagEnabled: false });
        await expectRefusal(
            service.mint(sessionUser, 'session-0000', 'show'),
            MobileSignInRefusal.FEATURE_DISABLED,
        );
    });

    it('refuses an unverified email when the instance sends email', async () => {
        const { service } = createService();
        await expectRefusal(
            service.mint(
                { ...sessionUser, isEmailVerified: false },
                'session-0000',
                'show',
            ),
            MobileSignInRefusal.EMAIL_UNVERIFIED,
        );
        const { service: noSmtp } = createService({ smtp: false });
        await expect(
            noSmtp.mint(
                { ...sessionUser, isEmailVerified: false },
                'session-0000',
                'show',
            ),
        ).resolves.toBeDefined();
    });

    it('refuses when managed sign-in applies on either platform', async () => {
        const { service, getManagedSignIn } = createService({ managed: true });
        await expectRefusal(
            service.mint(sessionUser, 'session-0000', 'show'),
            MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED,
        );
        expect(getManagedSignIn).toHaveBeenCalledWith('ios', sessionUser.email);
        expect(getManagedSignIn).toHaveBeenCalledWith(
            'android',
            sessionUser.email,
        );
    });

    it('caps mints per user', async () => {
        const { service, incrementRateCounter, mobileSignInCodeModel } =
            createService({
                rateAllowed: false,
            });
        const error = await service
            .mint(sessionUser, 'session-0000', 'auto_refresh')
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect((error as TooManyRequestsError).data).toMatchObject({
            reason: MobileSignInRefusal.RATE_LIMITED,
            retryAfterSeconds: 3582,
        });
        expect(incrementRateCounter).toHaveBeenCalledWith({
            keyHash: hashMobileAppLinkKey(userUuid),
            operation: 'mobile_sign_in.mint.user',
            windowStartedAt: new Date('2026-11-09T12:00:00.000Z'),
        });
        expect(mobileSignInCodeModel.mint).not.toHaveBeenCalled();
    });
});

describe('MobileSignInService analytics', () => {
    it('tracks the funnel with join keys and explicit nulls', async () => {
        const claim = vi.fn(async () => ({ outcome: 'claimed', row: codeRow }));
        const decide = vi.fn(async () => ({
            outcome: 'decided',
            row: codeRow,
        }));
        const { service, track } = createService({ model: { claim, decide } });

        await service.mint(sessionUser, 'session-0000', 'auto_refresh');
        await service.claim(
            {
                code,
                client_id: 'client-0000-test',
                code_challenge: challenge,
                code_challenge_method: 'S256',
                platform: 'ios',
            },
            {},
        );
        await service.decide(
            sessionUser,
            'session-0000',
            'code-0000-test',
            'nonce',
            'declined',
            {},
        );
        service.recordRedeemAllowed(
            {
                user: sessionUser,
                metadata: {
                    codeUuid: 'code-0000-test',
                    clientId: 'client-0000-test',
                    reportedPlatform: 'ios',
                },
            },
            {},
        );

        expect(track.mock.calls.map(([event]) => event)).toEqual([
            {
                event: 'mobile_sign_in_code.created',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    codeUuid: 'code-0000-test',
                    reason: 'auto_refresh',
                    platform: null,
                    declinedBy: null,
                },
            },
            expect.objectContaining({
                event: 'mobile_sign_in_code.claimed',
                properties: expect.objectContaining({ platform: 'ios' }),
            }),
            expect.objectContaining({
                event: 'mobile_sign_in_code.declined',
                properties: expect.objectContaining({ declinedBy: 'web' }),
            }),
            expect.objectContaining({
                event: 'mobile_sign_in_code.redeemed',
                userId: userUuid,
            }),
        ]);
        expect(JSON.stringify(track.mock.calls)).not.toContain(code);
    });

    it('tracks a decline caused by failed redeems', async () => {
        const { service, track } = createService({
            model: {
                redeem: vi.fn(async () => ({
                    outcome: 'wrong_number',
                    declined: {
                        mobile_sign_in_code_uuid: 'code-0000-test',
                        user_uuid: userUuid,
                        organization_uuid: organizationUuid,
                        reported_platform: 'android',
                    },
                })),
            },
        });
        await service
            .redeem(
                {
                    code,
                    clientId: 'client-0000-test',
                    codeVerifier: verifier,
                    matchNumber: '11',
                    isScopeAllowed: async () => true,
                },
                {},
            )
            .catch(() => undefined);
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'mobile_sign_in_code.declined',
                properties: expect.objectContaining({
                    declinedBy: 'failed_redeems',
                    platform: 'android',
                }),
            }),
        );
    });
});

describe('MobileSignInService.getState', () => {
    it('shows the number only while the code is claimed or approved', async () => {
        const findForSession = vi
            .fn()
            .mockResolvedValueOnce({
                ...codeRow,
                effective_status: MobileSignInCodeStatus.CLAIMED,
                client_name: 'Lightdash iOS',
            })
            .mockResolvedValueOnce({
                ...codeRow,
                effective_status: MobileSignInCodeStatus.REDEEMED,
                client_name: 'Lightdash iOS',
            })
            .mockResolvedValueOnce(null);
        const { service } = createService({ model: { findForSession } });

        expect(
            await service.getState(sessionUser, 'session-0000', 'code-0000'),
        ).toMatchObject({
            status: MobileSignInCodeStatus.CLAIMED,
            matchNumber: '07',
            device: { platform: 'ios', clientName: 'Lightdash iOS' },
        });
        expect(
            await service.getState(sessionUser, 'session-0000', 'code-0000'),
        ).toMatchObject({
            status: MobileSignInCodeStatus.REDEEMED,
            matchNumber: null,
        });
        await expect(
            service.getState(sessionUser, 'session-0000', 'code-0000'),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe('MobileSignInService.decide', () => {
    it('returns the number on approve', async () => {
        const decide = vi.fn(async () => ({
            outcome: 'decided',
            row: codeRow,
        }));
        const { service } = createService({ model: { decide } });
        expect(
            await service.decide(
                sessionUser,
                'session-0000',
                'code-0000',
                'nonce',
                'approved',
                {},
            ),
        ).toEqual({
            status: MobileSignInCodeStatus.APPROVED,
            matchNumber: '07',
        });
    });

    it('maps a session or nonce mismatch to 403 and a wrong state to 409 with the status', async () => {
        const decide = vi
            .fn()
            .mockResolvedValueOnce({ outcome: 'session_mismatch' })
            .mockResolvedValueOnce({
                outcome: 'invalid_state',
                status: MobileSignInCodeStatus.PENDING,
            })
            .mockResolvedValueOnce({ outcome: 'not_found' });
        const { service } = createService({ model: { decide } });
        const run = () =>
            service.decide(
                sessionUser,
                'session-0000',
                'code-0000',
                'nonce',
                'declined',
                {},
            );
        await expectRefusal(
            run(),
            MobileSignInRefusal.APPROVAL_SESSION_MISMATCH,
        );
        const conflict = await run().catch((caught: unknown) => caught);
        expect(conflict).toBeInstanceOf(ConflictError);
        expect((conflict as ConflictError).statusCode).toBe(409);
        expect((conflict as ConflictError).data).toEqual({
            reason: MobileSignInRefusal.INVALID_STATE,
            status: MobileSignInCodeStatus.PENDING,
        });
        await expect(run()).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses to approve when managed sign-in now applies', async () => {
        const decide = vi.fn();
        const { service } = createService({ managed: true, model: { decide } });
        await expectRefusal(
            service.decide(
                sessionUser,
                'session-0000',
                'code-0000',
                'nonce',
                'approved',
                {},
            ),
            MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED,
        );
        expect(decide).not.toHaveBeenCalled();
    });
});

describe('MobileSignInService.claim', () => {
    const body = {
        code,
        client_id: 'client-0000-test',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        platform: 'ios',
    };

    it('returns the instance, the masked name and the timing', async () => {
        const claim = vi.fn(async () => ({ outcome: 'claimed', row: codeRow }));
        const { service } = createService({ model: { claim } });
        const result = await service.claim(body, { ip: '203.0.113.7' });
        expect(result).toMatchObject({
            instance_url: 'https://app.example.test',
            display_name_masked: 'Te••• U.',
            interval: 2,
        });
        expect(result.expires_in).toBeGreaterThan(290);
        expect(JSON.stringify(result)).not.toContain('example.com');
        expect(claim).toHaveBeenCalledWith({
            code,
            clientId: 'client-0000-test',
            codeChallenge: challenge,
            platform: 'ios',
        });
    });

    it.each([
        ['code', { code: 'short' }],
        ['code_challenge', { code_challenge: 'nope' }],
        ['code_challenge_method', { code_challenge_method: 'plain' }],
        ['platform', { platform: 'web' }],
        ['client_id', { client_id: undefined }],
    ])('rejects a malformed %s', async (field, override) => {
        const { service } = createService();
        await expectOAuthError(service.claim({ ...body, ...override }, {}), {
            error: 'invalid_request',
            description: field,
        });
    });

    it('rejects a client that is not a mobile client', async () => {
        const { service } = createService({
            client: { id: 'cli', redirectUris: ['http://localhost/callback'] },
        });
        await expectOAuthError(service.claim(body, {}), {
            error: 'invalid_client',
            statusCode: 401,
        });
    });

    it('maps expired and used codes', async () => {
        const claim = vi
            .fn()
            .mockResolvedValueOnce({ outcome: 'expired' })
            .mockResolvedValueOnce({ outcome: 'already_used' });
        const { service } = createService({ model: { claim } });
        await expectOAuthError(service.claim(body, {}), {
            error: 'expired_token',
        });
        await expectOAuthError(service.claim(body, {}), {
            error: 'invalid_grant',
            description: 'code_already_used',
        });
    });

    it('limits claims per IP with 429', async () => {
        const claim = vi.fn();
        const { service, incrementRateCounter } = createService({
            rateAllowed: false,
            model: { claim },
        });
        await expectOAuthError(service.claim(body, { ip: '203.0.113.7' }), {
            error: 'rate_limited',
            statusCode: 429,
            retryAfterSeconds: 42,
        });
        expect(incrementRateCounter).toHaveBeenCalledWith({
            keyHash: hashMobileAppLinkKey('203.0.113.7'),
            operation: 'mobile_sign_in.claim.ip',
            windowStartedAt: new Date('2026-11-09T12:00:00.000Z'),
        });
        expect(claim).not.toHaveBeenCalled();
    });
});

describe('MobileSignInService.redeem', () => {
    const args = {
        code,
        clientId: 'client-0000-test',
        codeVerifier: verifier,
        matchNumber: '07',
        isScopeAllowed: async () => true,
    };

    it('returns the user and passes the typed number as a number', async () => {
        const redeem = vi.fn(async () => ({
            outcome: 'redeemed',
            row: codeRow,
        }));
        const { service } = createService({ model: { redeem } });
        const redemption = await service.redeem(args, {});
        expect(redemption.user).toBe(sessionUser);
        expect(redeem).toHaveBeenCalledWith({
            code,
            clientId: 'client-0000-test',
            codeVerifier: verifier,
            matchNumber: 7,
        });
    });

    it.each([
        ['code_verifier', { codeVerifier: 'short' }],
        ['match_number', { matchNumber: '7' }],
        ['match_number', { matchNumber: '100' }],
        ['match_number', { matchNumber: 7 }],
    ])('rejects a malformed %s', async (field, override) => {
        const redeem = vi.fn();
        const { service } = createService({ model: { redeem } });
        await expectOAuthError(service.redeem({ ...args, ...override }, {}), {
            error: 'invalid_request',
            description: field,
        });
        expect(redeem).not.toHaveBeenCalled();
    });

    it.each([
        [
            { outcome: 'authorization_pending' },
            { error: 'authorization_pending' },
        ],
        [{ outcome: 'slow_down' }, { error: 'slow_down' }],
        [
            { outcome: 'declined' },
            { error: 'access_denied', description: 'declined' },
        ],
        [{ outcome: 'expired' }, { error: 'expired_token' }],
        [
            { outcome: 'wrong_number', declined: null },
            { error: 'invalid_grant', description: 'wrong_number' },
        ],
        [
            { outcome: 'code_mismatch', declined: null },
            { error: 'invalid_grant', description: 'code_mismatch' },
        ],
        [
            {
                outcome: 'wrong_number',
                declined: {
                    mobile_sign_in_code_uuid: 'code-0000-test',
                    user_uuid: userUuid,
                    organization_uuid: organizationUuid,
                    reported_platform: 'ios',
                },
            },
            { error: 'access_denied', description: 'declined' },
        ],
    ])('maps %o to the RFC 8628 error', async (outcome, expected) => {
        const { service } = createService({
            model: { redeem: vi.fn(async () => outcome) },
        });
        await expectOAuthError(service.redeem(args, {}), {
            ...expected,
            statusCode: 400,
        });
    });

    it('re-checks the user before it uses up the code', async () => {
        const redeem = vi.fn(async () => ({
            outcome: 'redeemed',
            row: codeRow,
        }));
        const { service: managed, getManagedSignIn } = createService({
            managed: true,
            model: { redeem },
        });
        await expectOAuthError(managed.redeem(args, {}), {
            error: 'access_denied',
            description: 'managed_sign_in_required',
        });
        expect(getManagedSignIn).toHaveBeenCalledTimes(1);
        expect(getManagedSignIn).toHaveBeenCalledWith('ios', sessionUser.email);

        const { service: inactive } = createService({
            user: { ...sessionUser, isActive: false },
            model: { redeem },
        });
        await expectOAuthError(inactive.redeem(args, {}), {
            error: 'access_denied',
            description: 'user_not_allowed',
        });

        const { service: flagOff } = createService({
            flagEnabled: false,
            model: { redeem },
        });
        await expectOAuthError(flagOff.redeem(args, {}), {
            error: 'access_denied',
            description: 'feature_disabled',
            statusCode: 403,
        });
        expect(redeem).not.toHaveBeenCalled();
    });

    it('refuses when the user left the organization', async () => {
        const { service } = createService({
            model: {
                redeem: vi.fn(async () => ({
                    outcome: 'redeemed',
                    row: codeRow,
                })),
            },
        });
        vi.spyOn(
            (
                service as unknown as {
                    userModel: { findSessionUserAndOrgByUuid: () => unknown };
                }
            ).userModel,
            'findSessionUserAndOrgByUuid',
        ).mockRejectedValue(new Error('not a member'));
        await expectOAuthError(service.redeem(args, {}), {
            error: 'access_denied',
            description: 'user_not_allowed',
        });
    });
});

describe('MobileSignInService redeem rate limit', () => {
    const redeemArgs = (index: number) => ({
        code: `${String(index).padStart(2, '0')}${code.slice(2)}`,
        clientId: 'client-0000-test',
        codeVerifier: verifier,
        matchNumber: '07',
        isScopeAllowed: async () => true,
    });

    it('does not count pending polls: four phones on one address poll for a minute', async () => {
        let clock = new Date('2026-11-09T12:00:00.000Z').getTime();
        const redeem = vi.fn(async () => ({
            outcome: 'authorization_pending',
        }));
        const { service, incrementRateCounter } = createService({
            model: { redeem },
            now: () => new Date(clock),
        });
        const errors: string[] = [];
        for (let tick = 0; tick < 30; tick += 1) {
            for (let phone = 0; phone < 4; phone += 1) {
                // eslint-disable-next-line no-await-in-loop
                const error = await service
                    .redeem(redeemArgs(phone), { ip: '203.0.113.7' })
                    .catch((caught: MobileSignInOAuthError) => caught);
                errors.push((error as MobileSignInOAuthError).error);
            }
            clock += 2000;
        }
        expect(errors).toHaveLength(120);
        expect(new Set(errors)).toEqual(new Set(['authorization_pending']));
        expect(incrementRateCounter).not.toHaveBeenCalled();
    });

    it('does not count slow_down answers', async () => {
        const { service, incrementRateCounter } = createService({
            model: { redeem: vi.fn(async () => ({ outcome: 'slow_down' })) },
        });
        await expectOAuthError(
            service.redeem(redeemArgs(0), { ip: '203.0.113.7' }),
            { error: 'slow_down' },
        );
        expect(incrementRateCounter).not.toHaveBeenCalled();
    });

    it('refuses the 61st counted redeem from one address in a minute, before it touches a code', async () => {
        const redeem = vi.fn(async () => ({
            outcome: 'wrong_number',
            declined: null,
        }));
        const { service } = createService({ model: { redeem } });
        for (let attempt = 0; attempt < 60; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            await expectOAuthError(
                service.redeem(redeemArgs(attempt % 30), {
                    ip: '203.0.113.7',
                }),
                { error: 'invalid_grant', description: 'wrong_number' },
            );
        }
        await expectOAuthError(
            service.redeem(redeemArgs(31), { ip: '203.0.113.7' }),
            { error: 'rate_limited', statusCode: 429, retryAfterSeconds: 42 },
        );
        expect(redeem).toHaveBeenCalledTimes(60);
        await expectOAuthError(
            service.redeem(redeemArgs(31), { ip: '198.51.100.9' }),
            { error: 'invalid_grant', description: 'wrong_number' },
        );
    });

    it('counts malformed requests and successful redeems', async () => {
        const redeem = vi.fn(async () => ({
            outcome: 'redeemed',
            row: codeRow,
        }));
        const { service, incrementRateCounter } = createService({
            model: { redeem },
        });
        await service.redeem(redeemArgs(0), { ip: '203.0.113.7' });
        await expectOAuthError(
            service.redeem(
                { ...redeemArgs(1), matchNumber: '7' },
                { ip: '203.0.113.7' },
            ),
            { error: 'invalid_request', description: 'match_number' },
        );
        expect(incrementRateCounter).toHaveBeenCalledTimes(2);
    });
});

describe('MobileSignInService mobile-qr-sign-in flag', () => {
    const claimBody = {
        code,
        client_id: 'client-0000-test',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        platform: 'ios',
    };
    const redeemArgs = {
        code,
        clientId: 'client-0000-test',
        codeVerifier: verifier,
        matchNumber: '07',
        isScopeAllowed: async () => true,
    };
    const offService = () => {
        const model = {
            claim: vi.fn(),
            redeem: vi.fn(),
            decide: vi.fn(),
        };
        return {
            ...createService({ qrSignInEnabled: false, model }),
            model,
        };
    };

    it('refuses to create a code when the flag is off', async () => {
        const { service, mobileSignInCodeModel } = offService();
        const error = await service
            .mint(sessionUser, 'session-0000', 'show')
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).message).toBe(
            'Sign in with a QR code is turned off for this organization',
        );
        expect((error as ForbiddenError).data).toEqual({
            reason: MobileSignInRefusal.QR_SIGN_IN_DISABLED,
        });
        expect(mobileSignInCodeModel.mint).not.toHaveBeenCalled();
    });

    it.each(['approved', 'declined'] as const)(
        'refuses to record %s when the flag is off',
        async (decision) => {
            const { service, model } = offService();
            await expectRefusal(
                service.decide(
                    sessionUser,
                    'session-0000',
                    'code-0000',
                    'nonce',
                    decision,
                    {},
                ),
                MobileSignInRefusal.QR_SIGN_IN_DISABLED,
            );
            expect(model.decide).not.toHaveBeenCalled();
        },
    );

    it('refuses a claim with 403 before it touches the code', async () => {
        const { service, model } = offService();
        await expectOAuthError(service.claim(claimBody, {}), {
            error: 'access_denied',
            description: 'qr_sign_in_disabled',
            statusCode: 403,
        });
        expect(model.claim).not.toHaveBeenCalled();
    });

    it('refuses a redeem with 403 before it touches the code', async () => {
        const { service, model } = offService();
        await expectOAuthError(service.redeem(redeemArgs, {}), {
            error: 'access_denied',
            description: 'qr_sign_in_disabled',
            statusCode: 403,
        });
        expect(model.redeem).not.toHaveBeenCalled();
    });

    it('lets all five through when the flag is on', async () => {
        const model = {
            claim: vi.fn(async () => ({ outcome: 'claimed', row: codeRow })),
            redeem: vi.fn(async () => ({ outcome: 'redeemed', row: codeRow })),
            decide: vi.fn(async () => ({ outcome: 'decided', row: codeRow })),
        };
        const { service } = createService({ qrSignInEnabled: true, model });
        await expect(
            service.mint(sessionUser, 'session-0000', 'show'),
        ).resolves.toMatchObject({ codeUuid: 'code-0000-test' });
        await expect(service.claim(claimBody, {})).resolves.toMatchObject({
            interval: 2,
        });
        await expect(
            service.decide(
                sessionUser,
                'session-0000',
                'code-0000-test',
                'nonce',
                'approved',
                {},
            ),
        ).resolves.toMatchObject({ status: MobileSignInCodeStatus.APPROVED });
        await expect(
            service.decide(
                sessionUser,
                'session-0000',
                'code-0000-test',
                'nonce',
                'declined',
                {},
            ),
        ).resolves.toMatchObject({ status: MobileSignInCodeStatus.DECLINED });
        await expect(service.redeem(redeemArgs, {})).resolves.toMatchObject({
            user: sessionUser,
        });
    });
});

describe('MobileSignInService availability on every endpoint', () => {
    const claimBody = {
        code,
        client_id: 'client-0000-test',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        platform: 'ios',
    };
    const redeemArgs = {
        code,
        clientId: 'client-0000-test',
        codeVerifier: verifier,
        matchNumber: '07',
        isScopeAllowed: async () => true,
    };
    const untouchedModel = () => ({
        mint: vi.fn(),
        findForSession: vi.fn(),
        decide: vi.fn(),
        deleteForSession: vi.fn(),
        claim: vi.fn(),
        redeem: vi.fn(),
    });
    const webCalls = {
        mint: (service: MobileSignInService) =>
            service.mint(sessionUser, 'session-0000', 'show'),
        status: (service: MobileSignInService) =>
            service.getState(sessionUser, 'session-0000', 'code-0000'),
        approve: (service: MobileSignInService) =>
            service.decide(
                sessionUser,
                'session-0000',
                'code-0000',
                'nonce',
                'approved',
                {},
            ),
        decline: (service: MobileSignInService) =>
            service.decide(
                sessionUser,
                'session-0000',
                'code-0000',
                'nonce',
                'declined',
                {},
            ),
        cancel: (service: MobileSignInService) =>
            service.cancel(sessionUser, 'session-0000', 'code-0000'),
    };
    const phoneCalls = {
        claim: (service: MobileSignInService) => service.claim(claimBody, {}),
        redeem: (service: MobileSignInService) =>
            service.redeem(redeemArgs, {}),
    };
    const settings = [
        [
            'mobile-settings off',
            { flagEnabled: false },
            MobileSignInRefusal.FEATURE_DISABLED,
        ],
        [
            'mobile-qr-sign-in off',
            { qrSignInEnabled: false },
            MobileSignInRefusal.QR_SIGN_IN_DISABLED,
        ],
        [
            'a self-hosted instance (mode default)',
            { mode: LightdashMode.DEFAULT },
            MobileSignInRefusal.FEATURE_DISABLED,
        ],
    ] as const;

    describe.each(settings)('with %s', (_label, options, reason) => {
        it.each(Object.keys(webCalls) as (keyof typeof webCalls)[])(
            'refuses %s with 403 and leaves the code alone',
            async (endpoint) => {
                const model = untouchedModel();
                const { service } = createService({ ...options, model });
                const error = await webCalls[endpoint](service).catch(
                    (caught: unknown) => caught,
                );
                expect(error).toBeInstanceOf(ForbiddenError);
                expect((error as ForbiddenError).data).toEqual({ reason });
                Object.values(model).forEach((fn) =>
                    expect(fn).not.toHaveBeenCalled(),
                );
            },
        );

        it.each(Object.keys(phoneCalls) as (keyof typeof phoneCalls)[])(
            'refuses %s with 403 access_denied before it touches the code',
            async (endpoint) => {
                const model = untouchedModel();
                const { service } = createService({ ...options, model });
                await expectOAuthError(phoneCalls[endpoint](service), {
                    error: 'access_denied',
                    description: reason,
                    statusCode: 403,
                });
                expect(model.claim).not.toHaveBeenCalled();
                expect(model.redeem).not.toHaveBeenCalled();
            },
        );
    });

    it.each([LightdashMode.CLOUD_BETA, LightdashMode.PR])(
        'serves the hand-off in %s mode',
        async (mode) => {
            const model = {
                claim: vi.fn(async () => ({
                    outcome: 'claimed',
                    row: codeRow,
                })),
                redeem: vi.fn(async () => ({
                    outcome: 'redeemed',
                    row: codeRow,
                })),
            };
            const { service } = createService({ mode, model });
            await expect(
                service.mint(sessionUser, 'session-0000', 'show'),
            ).resolves.toMatchObject({ codeUuid: 'code-0000-test' });
            await expect(phoneCalls.claim(service)).resolves.toMatchObject({
                interval: 2,
            });
            await expect(phoneCalls.redeem(service)).resolves.toMatchObject({
                user: sessionUser,
            });
        },
    );

    it('refuses a scope outside the client before it uses up the code', async () => {
        const redeem = vi.fn();
        const { service } = createService({ model: { redeem } });
        await expectOAuthError(
            service.redeem(
                { ...redeemArgs, isScopeAllowed: async () => false },
                {},
            ),
            { error: 'invalid_scope' },
        );
        expect(redeem).not.toHaveBeenCalled();
    });

    it('answers user_not_allowed at claim when the user left the organization', async () => {
        const claim = vi.fn();
        const { service } = createService({ model: { claim } });
        vi.spyOn(
            (
                service as unknown as {
                    userModel: { findSessionUserAndOrgByUuid: () => unknown };
                }
            ).userModel,
            'findSessionUserAndOrgByUuid',
        ).mockRejectedValue(new Error('not a member'));
        await expectOAuthError(service.claim(claimBody, {}), {
            error: 'access_denied',
            description: 'user_not_allowed',
        });
        expect(claim).not.toHaveBeenCalled();
    });
});

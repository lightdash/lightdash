import {
    ForbiddenError,
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
    managed = false,
    smtp = true,
    user = sessionUser,
    rateAllowed = true,
    model = {},
    client = {
        id: 'client-0000-test',
        redirectUris: ['com.lightdash.mobile://oauth/callback'],
    },
}: {
    flagEnabled?: boolean;
    managed?: boolean;
    smtp?: boolean;
    user?: SessionUser;
    rateAllowed?: boolean;
    model?: Partial<Record<keyof MobileSignInCodeModel, unknown>>;
    client?: Record<string, unknown> | false;
} = {}) => {
    const mobileSignInCodeModel = {
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
    const incrementRateCounter = vi.fn(async () => (rateAllowed ? 1 : 1000));
    const track = vi.fn();
    const service = new MobileSignInService({
        analytics: { track },
        lightdashConfig: {
            siteUrl: 'https://app.example.test',
            smtp: smtp ? ({} as never) : undefined,
            trustProxy: true,
        },
        mobileSignInCodeModel,
        mobileAppLinkModel: { incrementRateCounter },
        now: () => new Date('2026-11-09T12:00:18.000Z'),
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: 'mobile-settings',
                enabled: flagEnabled,
            })),
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

    it('maps a session or nonce mismatch to 403 and a wrong state to 403 with the status', async () => {
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
        await expectRefusal(run(), MobileSignInRefusal.INVALID_STATE);
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

    it('re-checks the user at redeem', async () => {
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
            description: 'user_not_allowed',
        });
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

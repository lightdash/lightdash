import { type SessionUser } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { type UserService } from '../../services/UserService';
import { createGoogleOAuthCompatibilityHarness as createHarness } from '../../testing/googleOAuthCompatibilityHarness.mock';
import { createPatchedPrerequisiteGoogleBackend } from '../../testing/patchedPrerequisiteGoogleOAuth.mock';

const createGoogleOAuthCompatibilityHarness = (
    ...args: Parameters<typeof createHarness>
) =>
    createHarness(
        args[0],
        args[1],
        args[2] ?? createPatchedPrerequisiteGoogleBackend(),
        args[3],
    );

const user = { userUuid: randomUUID() } as SessionUser;
const services = () => ({
    storeOAuthGrant: vi.fn<UserService['storeOAuthGrant']>(),
    createBigqueryWarehouseCredentials:
        vi.fn<UserService['createBigqueryWarehouseCredentials']>(),
    loginWithOpenId: vi.fn<UserService['loginWithOpenId']>(),
});

afterEach(() => vi.restoreAllMocks());

test.each(
    [true, false].flatMap((loggedIn) =>
        [
            randomUUID(),
            '',
            ['credential_a', 'credential_b'],
            { nested: 'credential_a' },
        ].map((target) => ({ loggedIn, target })),
    ),
)(
    'rejects a supplied personal target before Passport with loggedIn=$loggedIn target=$target',
    async ({ loggedIn, target }) => {
        const service = services();
        const h = createGoogleOAuthCompatibilityHarness(
            loggedIn ? user : undefined,
            service,
        );
        const result = await h.invoke('/login/bigquery', {
            isPopup: 'true',
            personalCredentialUuid: target,
        });
        expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
        expect(result.session.oauth).toEqual({ isPopup: true, intent: 'link' });
        expect(h.authenticate).not.toHaveBeenCalled();
        expect(h.exchange).not.toHaveBeenCalled();
        expect(h.profile).not.toHaveBeenCalled();
        expect(service.storeOAuthGrant).not.toHaveBeenCalled();
        expect(
            service.createBigqueryWarehouseCredentials,
        ).not.toHaveBeenCalled();
        expect(service.loginWithOpenId).not.toHaveBeenCalled();
    },
);

test.each(['link', undefined, 'unexpected'])(
    'rejects callback metadata before intent dispatch for %s',
    async (intent) => {
        const service = services();
        const h = createGoogleOAuthCompatibilityHarness(user, service);
        const data = {
            cookie: { originalMaxAge: null },
            oauth: {
                isPopup: true,
                intent,
                googlePersonalReconnect: {
                    userUuid: user.userUuid,
                    credentialUuid: randomUUID(),
                },
            },
        };
        const result = await h.invoke(
            h.callbackPath,
            { code: 'code_a' },
            data as never,
        );
        expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
        expect(h.authenticate).not.toHaveBeenCalled();
        expect(h.exchange).not.toHaveBeenCalled();
        expect(service.storeOAuthGrant).not.toHaveBeenCalled();
        expect(
            service.createBigqueryWarehouseCredentials,
        ).not.toHaveBeenCalled();
        expect(service.loginWithOpenId).not.toHaveBeenCalled();
    },
);

test.each([undefined, null, '', {}])(
    'rejects malformed callback metadata by presence: %j',
    async (metadata) => {
        const service = services();
        const h = createGoogleOAuthCompatibilityHarness(user, service);
        const data = {
            cookie: { originalMaxAge: null },
            oauth: { isPopup: true, googlePersonalReconnect: metadata },
        };
        const result = await h.invoke(
            h.callbackPath,
            { code: 'code_a' },
            data as never,
        );
        expect(new URL(result.location!).pathname).toBe('/auth/popup/failure');
        expect(h.authenticate).not.toHaveBeenCalled();
        expect(h.exchange).not.toHaveBeenCalled();
        expect(service.loginWithOpenId).not.toHaveBeenCalled();
    },
);

test('starts normal consent without personal metadata when no user is logged in', async () => {
    const h = createGoogleOAuthCompatibilityHarness(undefined, services());
    const started = await h.invoke('/login/bigquery', { isPopup: 'true' });
    expect(new URL(started.location!).searchParams.get('prompt')).toBe(
        'consent',
    );
    expect(started.session.oauth).toEqual({ isPopup: true, intent: 'link' });
    expect(h.authenticate).toHaveBeenCalledOnce();
    expect(h.exchange).not.toHaveBeenCalled();
});

test('keeps consent, state and PKCE on a normal link and exchanges its callback', async () => {
    const service = services();
    const h = createGoogleOAuthCompatibilityHarness(user, service);
    const started = await h.invoke('/login/bigquery', {
        isPopup: 'true',
        reconnect: 'true',
    });
    const params = new URL(started.location!).searchParams;
    expect(params.get('prompt')).toBe('consent');
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('state')).toBeTruthy();
    expect(params.get('code_challenge')).toBeTruthy();
    expect(params.get('code_challenge_method')).toBe('S256');
    const result = await h.callback();
    expect(new URL(result.location!).pathname).toBe('/auth/popup/success');
    expect(h.exchange).toHaveBeenCalledOnce();
    expect(h.exchange.mock.calls[0][1]).toHaveProperty('code_verifier');
    expect(service.storeOAuthGrant).toHaveBeenCalledOnce();
    expect(service.createBigqueryWarehouseCredentials).toHaveBeenCalledOnce();
    expect(service.loginWithOpenId).not.toHaveBeenCalled();
});

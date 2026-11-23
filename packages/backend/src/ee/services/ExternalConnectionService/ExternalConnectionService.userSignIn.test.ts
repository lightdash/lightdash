import {
    ApiConnectorType,
    FeatureFlags,
    ForbiddenError,
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ENABLED_ENV,
    HYDRA_ORIGIN,
    HYDRA_REPORT_PATH,
    LiveSourceSignInRequiredError,
    NotFoundError,
    ParameterError,
    type ExternalConnection,
    type HydraApiSource,
} from '@lightdash/common';
import { z } from 'zod';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { ExternalConnectionService } from './ExternalConnectionService';
import { serializeStoredOAuthTokens } from './OAuthAuthorizationCodeTokenClient';
import { runAsSlackPreview } from './slackPreview';

const SITE_URL = 'https://lightdash.example.com';
const DEADLINE_MS = 30_000;

const viewer = (name: string) =>
    fromSession(
        {
            ...defaultSessionUser,
            userUuid: `${name}-uuid`,
            email: `${name}@example.com`,
        },
        'session-cookie',
    );

const alice = viewer('alice');
const bob = viewer('bob');

const hydraSource = (
    overrides: Partial<ExternalConnection> = {},
    settings: Partial<HydraApiSource> = {},
): ExternalConnection => ({
    externalConnectionUuid: 'conn-1',
    projectUuid: 'proj-1',
    organizationUuid: 'org-1',
    name: 'Team CRM',
    slug: 'team-crm',
    type: 'bearer_token',
    origin: HYDRA_ORIGIN,
    instructions: null,
    allowedPathPrefixes: [HYDRA_REPORT_PATH, HYDRA_ACCOUNT_PATH],
    allowedMethods: ['GET', 'POST'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1024 * 1024,
    requestMaxBytes: 262_144,
    timeoutMs: 30_000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: null,
    customHeaders: null,
    kind: 'live_source',
    apiSource: { ...HYDRA_DEFAULT_SOURCE, ...settings },
    signInMode: 'per_user',
    hasSecret: true,
    createdByUserUuid: 'admin-uuid',
    updatedByUserUuid: 'admin-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const buildService = ({
    connection = hydraSource(),
}: { connection?: ExternalConnection } = {}) => {
    // Viewers' sign-ins, as the model keeps them, by connection and user
    const userSecrets = new Map<string, string>();
    const key = (connectionUuid: string, userUuid: string) =>
        `${connectionUuid}/${userUuid}`;
    const externalConnectionModel = {
        findByUuid: vi.fn(async (uuid: string) =>
            uuid === connection.externalConnectionUuid ? connection : undefined,
        ),
        list: vi.fn().mockResolvedValue([connection]),
        getProjectOrganizationUuid: vi.fn().mockResolvedValue('org-1'),
        getDecryptedSecret: vi.fn().mockResolvedValue('admin-token'),
        getDecryptedUserSecret: vi.fn(
            async (connectionUuid: string, userUuid: string) =>
                userSecrets.get(key(connectionUuid, userUuid)) ?? null,
        ),
        saveUserSecret: vi.fn(
            async (
                connectionUuid: string,
                userUuid: string,
                secret: string,
            ) => {
                userSecrets.set(key(connectionUuid, userUuid), secret);
            },
        ),
        deleteUserSecret: vi.fn(
            async (connectionUuid: string, userUuid: string) =>
                userSecrets.delete(key(connectionUuid, userUuid)),
        ),
        updateUserSecretLocked: vi.fn(
            async (
                connectionUuid: string,
                userUuid: string,
                update: (current: string) => Promise<string | null>,
                forgetOn: (error: unknown) => boolean = () => false,
            ) => {
                const current = userSecrets.get(key(connectionUuid, userUuid));
                if (current === undefined) return null;
                let next: string | null;
                try {
                    next = await update(current);
                } catch (error) {
                    if (forgetOn(error)) {
                        userSecrets.delete(key(connectionUuid, userUuid));
                    }
                    throw error;
                }
                if (next === null) return current;
                userSecrets.set(key(connectionUuid, userUuid), next);
                return next;
            },
        ),
        getUserSignedInAt: vi.fn(
            async (connectionUuids: string[], userUuid: string) =>
                new Map(
                    connectionUuids
                        .filter((uuid) => userSecrets.has(key(uuid, userUuid)))
                        .map((uuid) => [uuid, new Date('2026-11-23')]),
                ),
        ),
        chargeApiSourceRateBuckets: vi.fn().mockResolvedValue({
            charged: true,
            now: new Date(),
            windows: [],
        }),
        refundApiSourceRateBuckets: vi.fn().mockResolvedValue(undefined),
        holdApiSourceRateBuckets: vi.fn().mockResolvedValue(undefined),
        bookApiSourceRateTurn: vi.fn().mockImplementation(async () => ({
            booked: true,
            turnAt: new Date(),
            now: new Date(),
        })),
        tryTakeApiSourceRateSlot: vi.fn().mockResolvedValue(true),
        releaseApiSourceRateSlot: vi.fn().mockResolvedValue(undefined),
        insertApiSourceCall: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ExternalConnectionService({
        allowedPrivateHostCidrs: {},
        externalConnectionModel,
        analytics: { track: vi.fn(), trackAccount: vi.fn() },
        lightdashConfig: { siteUrl: SITE_URL },
        featureFlagModel: {
            get: vi.fn(async ({ featureFlagId }) => ({
                enabled: featureFlagId === FeatureFlags.ApiQuerySources,
            })),
        },
    } as never);
    return {
        service,
        externalConnectionModel,
        signIn: (userUuid: string, tokens: object) =>
            userSecrets.set(
                key(connection.externalConnectionUuid, userUuid),
                JSON.stringify(tokens),
            ),
        storedSignIn: (userUuid: string) =>
            userSecrets.get(key(connection.externalConnectionUuid, userUuid)),
    };
};

const accountSchema = z.object({ account: z.string() });

/** The Hydra account a query on the source reads, as this viewer. */
const readAccount = async (
    service: ExternalConnectionService,
    account: typeof alice,
) => {
    const source = await service.getLiveSourceForExplore(
        account,
        'proj-1',
        'conn-1',
        DEADLINE_MS,
    );
    const { account: hydraAccount } = await source.calls.fetch(
        { method: 'GET', path: HYDRA_ACCOUNT_PATH, body: undefined },
        accountSchema,
    );
    return { source, hydraAccount };
};

/** What Hydra's consent screen answers the browser sent to `authorizeUrl`. */
const consentInHydra = (
    service: ExternalConnectionService,
    account: typeof alice,
    authorizeUrl: string,
) => {
    const params = new URL(authorizeUrl).searchParams;
    const param = (name: string) => params.get(name) ?? undefined;
    return service.authorizeHydraUserSignIn(account, {
        responseType: param('response_type'),
        clientId: param('client_id'),
        resource: param('resource'),
        redirectUri: param('redirect_uri'),
        state: param('state'),
        codeChallenge: param('code_challenge'),
        codeChallengeMethod: param('code_challenge_method'),
    });
};

/** Signs a viewer in through Hydra's consent screen, as the browser would. */
const signInThroughHydra = async (
    service: ExternalConnectionService,
    account: typeof alice,
) => {
    const { authorizeUrl, state, session } = await service.startUserSignIn(
        account,
        'proj-1',
        'conn-1',
        '/projects/proj-1/saved/chart-1',
    );
    const callback = new URL(
        await consentInHydra(service, account, authorizeUrl),
    );
    expect(callback.searchParams.get('state')).toBe(state);
    await service.completeUserSignIn(
        account,
        session,
        callback.searchParams.get('code') ?? '',
    );
};

beforeAll(() => {
    process.env[HYDRA_ENABLED_ENV] = 'true';
});

afterAll(() => {
    delete process.env[HYDRA_ENABLED_ENV];
});

describe('Live sources that query with each viewer’s own sign-in', () => {
    it('reads each viewer’s own rows and keeps their results apart', async () => {
        const { service } = buildService();
        await signInThroughHydra(service, alice);
        await signInThroughHydra(service, bob);

        const asAlice = await readAccount(service, alice);
        const asBob = await readAccount(service, bob);

        expect(asAlice.hydraAccount).not.toBe(asBob.hydraAccount);
        expect(asAlice.source.cache.scope).toEqual({
            kind: 'viewer',
            userUuid: 'alice-uuid',
            signedInAt: new Date('2026-11-23'),
        });
        expect(asBob.source.cache.scope).toEqual({
            kind: 'viewer',
            userUuid: 'bob-uuid',
            signedInAt: new Date('2026-11-23'),
        });
    });

    it("never reuses rows cached before the viewer's latest sign-in", async () => {
        const { service } = buildService({
            connection: hydraSource({ cachePurgedAt: new Date('2026-01-01') }),
        });
        await signInThroughHydra(service, alice);
        const { source } = await readAccount(service, alice);
        // The fake model reports this sign-in time, later than the purge
        expect(source.cache.purgedAt).toEqual(new Date('2026-11-23'));
    });

    it('reads the same rows for a viewer across sign-ins', async () => {
        const { service } = buildService();
        await signInThroughHydra(service, alice);
        const first = await readAccount(service, alice);
        await signInThroughHydra(service, alice);
        const second = await readAccount(service, alice);

        expect(second.hydraAccount).toBe(first.hydraAccount);
    });

    it('asks a viewer with no sign-in to connect, before calling the API', async () => {
        const { service, externalConnectionModel } = buildService();

        const error = await service
            .getLiveSourceForExplore(alice, 'proj-1', 'conn-1', DEADLINE_MS)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LiveSourceSignInRequiredError);
        expect((error as LiveSourceSignInRequiredError).data).toEqual({
            liveSourceErrorCode: 'live_source.refused.sign_in_required',
            liveSourceErrorCodes: ['live_source.refused.sign_in_required'],
            signIn: {
                externalConnectionUuid: 'conn-1',
                name: 'Team CRM',
                integration: 'Hydra',
                reason: 'missing',
                connectUrl: `${SITE_URL}/api/v1/ee/projects/proj-1/live-sources/conn-1/user-sign-in/start`,
            },
        });
        expect(
            externalConnectionModel.getDecryptedSecret,
        ).not.toHaveBeenCalled();
    });

    it('keeps one shared sign-in and shared results for a shared source', async () => {
        const { service, externalConnectionModel } = buildService({
            connection: hydraSource({ signInMode: 'shared' }),
        });

        const asAlice = await readAccount(service, alice);
        const asBob = await readAccount(service, bob);

        expect(asAlice.hydraAccount).toBe(asBob.hydraAccount);
        expect(asAlice.source.cache.scope).toEqual({ kind: 'source' });
        expect(
            externalConnectionModel.getDecryptedUserSecret,
        ).not.toHaveBeenCalled();
    });

    it('refreshes an expired sign-in and keeps the rotated tokens', async () => {
        const { service, signIn, storedSignIn } = buildService();
        await signInThroughHydra(service, alice);
        const { hydraAccount } = await readAccount(service, alice);
        const signedIn = JSON.parse(storedSignIn('alice-uuid') ?? '{}');
        signIn('alice-uuid', { ...signedIn, expiresAt: Date.now() - 1_000 });

        const refreshed = await readAccount(service, alice);

        const stored = JSON.parse(storedSignIn('alice-uuid') ?? '{}');
        expect(refreshed.hydraAccount).toBe(hydraAccount);
        expect(stored.accessToken).not.toBe(signedIn.accessToken);
        expect(stored.refreshToken).not.toBe(signedIn.refreshToken);
        expect(stored.expiresAt).toBeGreaterThan(Date.now());
    });

    it('refreshes and replays once when the API rejects a token it thought fresh', async () => {
        const { service, signIn, storedSignIn } = buildService();
        await signInThroughHydra(service, alice);
        const signedIn = JSON.parse(storedSignIn('alice-uuid') ?? '{}');
        // Hydra's token says it expired; the stored expiry says it's fresh
        const [prefix, payload] = signedIn.accessToken.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        signIn('alice-uuid', {
            ...signedIn,
            accessToken: `${prefix}.${Buffer.from(
                JSON.stringify({ ...claims, exp: Date.now() - 1_000 }),
            ).toString('base64url')}`,
        });

        const { hydraAccount } = await readAccount(service, alice);

        expect(hydraAccount).toMatch(/^hydra-/);
        expect(
            JSON.parse(storedSignIn('alice-uuid') ?? '{}').accessToken,
        ).not.toBe(signedIn.accessToken);
    });

    it('forgets a revoked sign-in and asks the viewer to connect again', async () => {
        const settings = { tokenTtlSeconds: 60 };
        const signedInSource = buildService({
            connection: hydraSource({}, settings),
        });
        await signInThroughHydra(signedInSource.service, alice);
        const tokens = signedInSource.storedSignIn('alice-uuid');

        const { service, signIn, storedSignIn } = buildService({
            connection: hydraSource(
                {},
                { ...settings, revokedViewers: ['alice@example.com'] },
            ),
        });
        signIn('alice-uuid', {
            ...JSON.parse(tokens ?? '{}'),
            expiresAt: Date.now() - 1_000,
        });

        await expect(
            service.getLiveSourceForExplore(
                alice,
                'proj-1',
                'conn-1',
                DEADLINE_MS,
            ),
        ).rejects.toMatchObject({
            name: 'LiveSourceSignInRequiredError',
            data: { signIn: { reason: 'expired' } },
        });
        expect(storedSignIn('alice-uuid')).toBeUndefined();
    });

    it('forgets a sign-in revoked mid-query once its refresh is refused', async () => {
        const signedInSource = buildService();
        await signInThroughHydra(signedInSource.service, alice);
        const { service, signIn, storedSignIn } = buildService({
            connection: hydraSource(
                {},
                { revokedViewers: ['alice@example.com'] },
            ),
        });
        // Fresh by its stored expiry, so the query starts and Hydra rejects it
        signIn(
            'alice-uuid',
            JSON.parse(signedInSource.storedSignIn('alice-uuid') ?? '{}'),
        );
        const source = await service.getLiveSourceForExplore(
            alice,
            'proj-1',
            'conn-1',
            DEADLINE_MS,
        );

        await expect(
            source.calls.fetch(
                { method: 'GET', path: HYDRA_ACCOUNT_PATH, body: undefined },
                accountSchema,
            ),
        ).rejects.toBeInstanceOf(LiveSourceSignInRequiredError);
        expect(storedSignIn('alice-uuid')).toBeUndefined();
    });

    it('keeps other viewers signed in when one is revoked', async () => {
        const signedInSource = buildService();
        await signInThroughHydra(signedInSource.service, alice);
        await signInThroughHydra(signedInSource.service, bob);
        const { service, signIn } = buildService({
            connection: hydraSource(
                {},
                { revokedViewers: ['alice@example.com'] },
            ),
        });
        ['alice-uuid', 'bob-uuid'].forEach((userUuid) =>
            signIn(
                userUuid,
                JSON.parse(signedInSource.storedSignIn(userUuid) ?? '{}'),
            ),
        );

        const { source } = await readAccount(service, bob).then(
            (asBob) => asBob,
        );
        expect(source.cache.scope).toMatchObject({ userUuid: 'bob-uuid' });
        await expect(readAccount(service, alice)).rejects.toBeInstanceOf(
            LiveSourceSignInRequiredError,
        );
    });

    it('stores nothing when the viewer declines consent', async () => {
        const { service, storedSignIn } = buildService({
            connection: hydraSource({}, { denyConsent: true }),
        });
        const { authorizeUrl } = await service.startUserSignIn(
            alice,
            'proj-1',
            'conn-1',
            '/',
        );

        const callback = new URL(
            await consentInHydra(service, alice, authorizeUrl),
        );

        expect(callback.searchParams.get('error')).toBe('access_denied');
        expect(callback.searchParams.get('code')).toBeNull();
        expect(storedSignIn('alice-uuid')).toBeUndefined();
    });

    it('sends Hydra the source, PKCE and its client secret', async () => {
        const { service } = buildService();
        const { authorizeUrl } = await service.startUserSignIn(
            alice,
            'proj-1',
            'conn-1',
            '/',
        );
        const params = new URL(authorizeUrl).searchParams;
        expect(params.get('resource')).toBe('conn-1');
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('response_type')).toBe('code');
    });

    it('stops reading a viewer’s data once they disconnect', async () => {
        const { service } = buildService();
        await signInThroughHydra(service, alice);
        await readAccount(service, alice);

        await service.deleteUserSignIn(alice, 'proj-1', 'conn-1');

        await expect(
            service.getLiveSourceForExplore(
                alice,
                'proj-1',
                'conn-1',
                DEADLINE_MS,
            ),
        ).rejects.toBeInstanceOf(LiveSourceSignInRequiredError);
        await expect(service.listUserSignIns(alice, 'proj-1')).resolves.toEqual(
            [
                expect.objectContaining({
                    externalConnectionUuid: 'conn-1',
                    isSignedIn: false,
                }),
            ],
        );
    });

    it('refuses service accounts, which have no sign-in of their own', async () => {
        const { service } = buildService();
        const serviceAccount = {
            ...alice,
            authentication: {
                type: 'service-account',
                source: 'token',
                serviceAccountUuid: 'sa-1',
                serviceAccountDescription: 'CI',
            },
        } as unknown as typeof alice;

        await expect(
            service.getLiveSourceForExplore(
                serviceAccount,
                'proj-1',
                'conn-1',
                DEADLINE_MS,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('refuses a Slack link preview, which would post one viewer’s data to a channel', async () => {
        const { service } = buildService();
        await signInThroughHydra(service, alice);

        await expect(
            runAsSlackPreview(() =>
                service.getLiveSourceForExplore(
                    alice,
                    'proj-1',
                    'conn-1',
                    DEADLINE_MS,
                ),
            ),
        ).rejects.toThrow("so Slack can't preview it");
    });

    it('lets Slack preview a source with one shared sign-in', async () => {
        const { service } = buildService({
            connection: hydraSource({ signInMode: 'shared' }),
        });

        await expect(
            runAsSlackPreview(() => readAccount(service, alice)),
        ).resolves.toMatchObject({ hydraAccount: expect.any(String) });
    });

    it('lists the viewer’s sign-ins to per-viewer sources only', async () => {
        const { service } = buildService();
        await signInThroughHydra(service, alice);

        await expect(service.listUserSignIns(alice, 'proj-1')).resolves.toEqual(
            [
                {
                    externalConnectionUuid: 'conn-1',
                    name: 'Team CRM',
                    connector: ApiConnectorType.HYDRA,
                    isSignedIn: true,
                    signedInAt: new Date('2026-11-23'),
                },
            ],
        );
        await expect(service.listUserSignIns(bob, 'proj-1')).resolves.toEqual([
            expect.objectContaining({ isSignedIn: false }),
        ]);
    });

    it('has nothing to connect on a shared source', async () => {
        const { service } = buildService({
            connection: hydraSource({ signInMode: 'shared' }),
        });

        await expect(
            service.startUserSignIn(alice, 'proj-1', 'conn-1', '/'),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('answers Hydra’s consent only for its own client, callback and sources', async () => {
        const { service } = buildService();
        const { authorizeUrl } = await service.startUserSignIn(
            alice,
            'proj-1',
            'conn-1',
            '/',
        );
        const withParam = (name: string, value: string) => {
            const url = new URL(authorizeUrl);
            url.searchParams.set(name, value);
            return url.href;
        };

        await expect(
            consentInHydra(
                service,
                alice,
                withParam('redirect_uri', 'https://evil.example.com/callback'),
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            consentInHydra(service, alice, withParam('client_id', 'other')),
        ).rejects.toBeInstanceOf(ParameterError);
        await expect(
            consentInHydra(service, alice, withParam('resource', 'conn-2')),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses a code whose verifier does not match', async () => {
        const { service, storedSignIn } = buildService();
        const { session } = await service.startUserSignIn(
            alice,
            'proj-1',
            'conn-1',
            '/',
        );

        await expect(
            service.completeUserSignIn(
                alice,
                session,
                `hydra-code.${Buffer.from('alice').toString('base64url')}.wrong`,
            ),
        ).rejects.toThrow('Hydra did not accept the sign-in');
        expect(storedSignIn('alice-uuid')).toBeUndefined();
    });

    it('keeps a stored token usable without a refresh token until it expires', async () => {
        const { service, signIn } = buildService();
        signIn(
            'alice-uuid',
            JSON.parse(
                serializeStoredOAuthTokens({
                    accessToken: 'plain-token',
                    refreshToken: null,
                    expiresAt: null,
                }),
            ),
        );

        const { hydraAccount } = await readAccount(service, alice);

        expect(hydraAccount).toMatch(/^hydra-/);
    });
});

describe('Choosing whose sign-in a live source uses', () => {
    it('offers each viewer’s own sign-in only for integrations that support it', async () => {
        const { service } = buildService();
        vi.spyOn(
            service as unknown as { createAuditedAbility: () => unknown },
            'createAuditedAbility',
        ).mockReturnValue({ can: () => true, cannot: () => false });

        await expect(
            service.create(alice, 'proj-1', {
                name: 'PostHog',
                type: 'bearer_token',
                origin: 'https://eu.posthog.com',
                secret: 'phx',
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '1',
                },
                signInMode: 'per_user',
                allowedMethods: ['POST'],
                allowedPathPrefixes: [],
                allowedContentTypes: ['application/json'],
            }),
        ).rejects.toThrow("PostHog can't sign in each viewer yet");
    });
});

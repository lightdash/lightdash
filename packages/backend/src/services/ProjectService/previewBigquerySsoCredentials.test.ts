import {
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { UserRefreshClient } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    getWarehouseCredentialVersions,
    withWarehouseCredentialVersion,
} from '../../utils/warehouseCredentialVersion';
import {
    checkGoogleRefreshTokenCached,
    getPreviewOwnsBigquerySsoCredentials,
    getPushedPreviewCredentials,
    recheckGoogleRefreshToken,
    repairStalePreviewBigquerySso,
    type CheckGoogleRefreshToken,
} from './previewBigquerySsoCredentials';

const google = vi.hoisted(() => ({
    rejectedTokens: new Set<string>(),
    getAccessToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
    UserRefreshClient: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockUserRefreshClient({
            refreshToken,
        }: {
            refreshToken: string;
        }) {
            return {
                getAccessToken: async () => {
                    google.getAccessToken(refreshToken);
                    if (google.rejectedTokens.has(refreshToken)) {
                        throw Object.assign(new Error('invalid_grant'), {
                            response: {
                                status: 400,
                                data: { error: 'invalid_grant' },
                            },
                        });
                    }
                    return { token: 'access-token' };
                },
            };
        },
    ),
}));

const LIGHTDASH_CLIENT = 'lightdash-client.apps.googleusercontent.com';

const bigquerySso = (
    refreshToken: string,
    overrides: Partial<CreateBigqueryCredentials> = {},
    clientId = LIGHTDASH_CLIENT,
): CreateBigqueryCredentials => ({
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    project: 'analytics',
    dataset: 'prod',
    timeoutSeconds: 300,
    priority: 'interactive',
    retries: 3,
    location: 'EU',
    maximumBytesBilled: undefined,
    keyfileContents: {
        type: 'authorized_user',
        client_id: clientId,
        client_secret: 'secret',
        refresh_token: refreshToken,
    },
    ...overrides,
});

const privateKey: CreateWarehouseCredentials = {
    ...bigquerySso('unused'),
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: { type: 'service_account', private_key: 'key' },
};

const refreshTokenOf = (credentials: CreateWarehouseCredentials | null) =>
    credentials?.type === WarehouseTypes.BIGQUERY
        ? credentials.keyfileContents.refresh_token
        : undefined;

const tokenCheck = (
    statuses: Record<string, 'valid' | 'rejected' | 'unknown'>,
) =>
    vi.fn<CheckGoogleRefreshToken>(async (keyfile) =>
        keyfile.refresh_token ? statuses[keyfile.refresh_token] : 'unknown',
    );

describe('getPushedPreviewCredentials', () => {
    it('moves a preview created with token A to token B when the parent refreshes', () => {
        const preview = bigquerySso('token-a', { dataset: 'preview_schema' });

        const pushed = getPushedPreviewCredentials({
            previewCredentials: preview,
            previousUpstreamCredentials: bigquerySso('token-a'),
            nextUpstreamCredentials: bigquerySso('token-b'),
        });

        expect(refreshTokenOf(pushed)).toBe('token-b');
        expect(pushed?.dataset).toBe('preview_schema');
    });

    it('leaves a preview with its own refresh token untouched', () => {
        expect(
            getPushedPreviewCredentials({
                previewCredentials: bigquerySso('own-token'),
                previousUpstreamCredentials: bigquerySso('token-a'),
                nextUpstreamCredentials: bigquerySso('token-b'),
            }),
        ).toBeNull();
    });

    it('leaves a preview signed in through another OAuth client untouched', () => {
        expect(
            getPushedPreviewCredentials({
                previewCredentials: bigquerySso('token-a', {}, 'gcloud-client'),
                previousUpstreamCredentials: bigquerySso('token-a'),
                nextUpstreamCredentials: bigquerySso('token-b'),
            }),
        ).toBeNull();
    });

    it('leaves a preview with a service account key untouched', () => {
        expect(
            getPushedPreviewCredentials({
                previewCredentials: privateKey,
                previousUpstreamCredentials: bigquerySso('token-a'),
                nextUpstreamCredentials: bigquerySso('token-b'),
            }),
        ).toBeNull();
    });

    it('does nothing when the parent moves off BigQuery SSO', () => {
        expect(
            getPushedPreviewCredentials({
                previewCredentials: bigquerySso('token-a'),
                previousUpstreamCredentials: bigquerySso('token-a'),
                nextUpstreamCredentials: privateKey,
            }),
        ).toBeNull();
    });

    it('does nothing when the token did not change', () => {
        expect(
            getPushedPreviewCredentials({
                previewCredentials: bigquerySso('token-a'),
                previousUpstreamCredentials: bigquerySso('token-a'),
                nextUpstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBeNull();
    });
});

describe('repairStalePreviewBigquerySso', () => {
    it('copies the parent token into a stale preview after one rejected check', async () => {
        const checkRefreshToken = tokenCheck({
            'token-a': 'rejected',
            'token-b': 'valid',
        });

        const repair = await repairStalePreviewBigquerySso({
            previewCredentials: bigquerySso('token-a', {
                dataset: 'preview_schema',
            }),
            upstreamCredentials: bigquerySso('token-b'),
            checkRefreshToken,
        });

        expect(repair.kind).toBe('repaired');
        if (repair.kind !== 'repaired') return;
        expect(refreshTokenOf(repair.credentials)).toBe('token-b');
        expect(repair.credentials.dataset).toBe('preview_schema');
        expect(repair.staleRefreshToken).toBe('token-a');
        expect(checkRefreshToken).toHaveBeenCalledTimes(2);
    });

    it('stops after one retry when the parent token is rejected too', async () => {
        const checkRefreshToken = tokenCheck({
            'token-a': 'rejected',
            'token-b': 'rejected',
        });

        const repair = await repairStalePreviewBigquerySso({
            previewCredentials: bigquerySso('token-a'),
            upstreamCredentials: bigquerySso('token-b'),
            checkRefreshToken,
        });

        expect(repair).toEqual({ kind: 'expired' });
        expect(checkRefreshToken).toHaveBeenCalledTimes(2);
    });

    it('checks the token once when the preview holds the parent token', async () => {
        const checkRefreshToken = tokenCheck({ 'token-b': 'valid' });

        const repair = await repairStalePreviewBigquerySso({
            previewCredentials: bigquerySso('token-b'),
            upstreamCredentials: bigquerySso('token-b'),
            checkRefreshToken,
        });

        expect(repair).toEqual({ kind: 'unchanged' });
        expect(checkRefreshToken).toHaveBeenCalledTimes(1);
    });

    it('reports the parent sign-in as expired when both share a rejected token', async () => {
        const checkRefreshToken = tokenCheck({ 'token-a': 'rejected' });

        const repair = await repairStalePreviewBigquerySso({
            previewCredentials: bigquerySso('token-a'),
            upstreamCredentials: bigquerySso('token-a'),
            checkRefreshToken,
        });

        expect(repair).toEqual({ kind: 'expired' });
        expect(checkRefreshToken).toHaveBeenCalledTimes(1);
    });

    it('leaves a preview with its own working credential untouched', async () => {
        const checkRefreshToken = tokenCheck({
            'own-token': 'valid',
            'token-b': 'valid',
        });

        const repair = await repairStalePreviewBigquerySso({
            previewCredentials: bigquerySso('own-token'),
            upstreamCredentials: bigquerySso('token-b'),
            checkRefreshToken,
        });

        expect(repair).toEqual({ kind: 'unchanged' });
        expect(checkRefreshToken).toHaveBeenCalledTimes(1);
    });

    it('leaves a preview signed in through another OAuth client untouched', async () => {
        const checkRefreshToken = tokenCheck({ 'token-a': 'rejected' });

        const repair = await repairStalePreviewBigquerySso({
            previewCredentials: bigquerySso('token-a', {}, 'gcloud-client'),
            upstreamCredentials: bigquerySso('token-b'),
            checkRefreshToken,
        });

        expect(repair).toEqual({ kind: 'unchanged' });
        expect(checkRefreshToken).not.toHaveBeenCalled();
    });

    it('leaves the preview alone when Google cannot be reached', async () => {
        const checkRefreshToken = tokenCheck({
            'token-a': 'rejected',
            'token-b': 'unknown',
        });

        await expect(
            repairStalePreviewBigquerySso({
                previewCredentials: bigquerySso('token-a'),
                upstreamCredentials: bigquerySso('token-b'),
                checkRefreshToken,
            }),
        ).resolves.toEqual({ kind: 'unchanged' });
    });
});

describe('getPreviewOwnsBigquerySsoCredentials', () => {
    it('is false for a copy of the parent credential', () => {
        expect(
            getPreviewOwnsBigquerySsoCredentials({
                previewCredentials: bigquerySso('token-a', {
                    dataset: 'preview_schema',
                }),
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBe(false);
    });

    it('is true for another refresh token or OAuth client', () => {
        expect(
            getPreviewOwnsBigquerySsoCredentials({
                previewCredentials: bigquerySso('own-token'),
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBe(true);
        expect(
            getPreviewOwnsBigquerySsoCredentials({
                previewCredentials: bigquerySso('token-a', {}, 'gcloud-client'),
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBe(true);
    });

    it('is true when the parent does not use BigQuery SSO', () => {
        expect(
            getPreviewOwnsBigquerySsoCredentials({
                previewCredentials: bigquerySso('token-a'),
                upstreamCredentials: privateKey,
            }),
        ).toBe(true);
    });

    it('is null when the preview does not use BigQuery SSO', () => {
        expect(
            getPreviewOwnsBigquerySsoCredentials({
                previewCredentials: privateKey,
                upstreamCredentials: bigquerySso('token-a'),
            }),
        ).toBeNull();
    });
});

describe('checkGoogleRefreshTokenCached and recheckGoogleRefreshToken', () => {
    it('rechecks a token the cache still holds as valid', async () => {
        const { keyfileContents } = bigquerySso('recheck-token');

        await expect(
            checkGoogleRefreshTokenCached(
                keyfileContents,
                lightdashConfigMock.auth.google,
            ),
        ).resolves.toBe('valid');
        google.rejectedTokens.add('recheck-token');
        await expect(
            checkGoogleRefreshTokenCached(
                keyfileContents,
                lightdashConfigMock.auth.google,
            ),
        ).resolves.toBe('valid');
        expect(google.getAccessToken).toHaveBeenCalledTimes(1);

        await expect(
            recheckGoogleRefreshToken(
                keyfileContents,
                lightdashConfigMock.auth.google,
            ),
        ).resolves.toBe('rejected');
        await expect(
            checkGoogleRefreshTokenCached(
                keyfileContents,
                lightdashConfigMock.auth.google,
            ),
        ).resolves.toBe('rejected');
        expect(google.getAccessToken).toHaveBeenCalledTimes(3);
    });
});

it('checks secret-free preview credentials with the configured secret', async () => {
    const keyfile = {
        type: 'authorized_user',
        client_id: 'saved-client',
        refresh_token: 'secret-free-preview',
    };
    await expect(
        recheckGoogleRefreshToken(keyfile, lightdashConfigMock.auth.google),
    ).resolves.toBe('valid');
    expect(UserRefreshClient).toHaveBeenLastCalledWith({
        clientId: 'saved-client',
        clientSecret: lightdashConfigMock.auth.google.oauth2ClientSecret,
        refreshToken: 'secret-free-preview',
    });
    expect(keyfile).not.toHaveProperty('client_secret');
});

it.each([undefined, '', '   '])(
    'checks preview credentials with the stored secret when the configured secret is %j',
    async (oauth2ClientSecret) => {
        const config = {
            ...lightdashConfigMock.auth.google,
            oauth2ClientId: LIGHTDASH_CLIENT,
            oauth2ClientSecret,
        };
        const { keyfileContents } = bigquerySso('legacy-preview');
        await expect(
            recheckGoogleRefreshToken(keyfileContents, config),
        ).resolves.toBe('valid');
        expect(UserRefreshClient).toHaveBeenLastCalledWith({
            clientId: LIGHTDASH_CLIENT,
            clientSecret: 'secret',
            refreshToken: 'legacy-preview',
        });
        expect(keyfileContents.client_secret).toBe('secret');
    },
);

describe('preview credential version metadata', () => {
    it('keeps the preview version and hides its marker through a keyfile repair', async () => {
        const preview = withWarehouseCredentialVersion(
            bigquerySso('old-token'),
            'preview-version',
        );
        const upstream = withWarehouseCredentialVersion(
            bigquerySso('fresh-token'),
            'upstream-version',
        );
        const repaired = await repairStalePreviewBigquerySso({
            previewCredentials: preview,
            upstreamCredentials: upstream,
            checkRefreshToken: async (keyfile) =>
                keyfile.refresh_token === 'old-token' ? 'rejected' : 'valid',
        });
        expect(repaired.kind).toBe('repaired');
        if (repaired.kind !== 'repaired') throw new Error('Expected repair');
        expect(getWarehouseCredentialVersions(repaired.credentials)).toEqual([
            'preview-version',
        ]);
        expect(repaired.credentials).not.toHaveProperty(
            'resultIdentityVersion',
        );
        expect(
            getWarehouseCredentialVersions(
                getPushedPreviewCredentials({
                    previewCredentials: preview,
                    previousUpstreamCredentials: bigquerySso('old-token'),
                    nextUpstreamCredentials: upstream,
                })!,
            ),
        ).toEqual(['preview-version']);
    });
});

import { OpenIdIdentityIssuerType, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    exportGoogleGrant,
    getGoogleGrantErrorFields,
    readConnectedGoogleGrant,
    runGoogleGrant,
    seedGoogleGrant,
    validateGoogleGrant,
} from './googleGrant';

const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
];

const createStore = () => ({
    find: vi.fn<Parameters<typeof seedGoogleGrant>[1]['find']>(),
    upsert: vi.fn<Parameters<typeof seedGoogleGrant>[1]['upsert']>(),
    decrypt: vi.fn<Parameters<typeof seedGoogleGrant>[1]['decrypt']>(),
});

describe('seedGoogleGrant', () => {
    it('does not open the grant store when the secret is absent', async () => {
        const store = createStore();
        await seedGoogleGrant(undefined, store);
        expect(store.find).not.toHaveBeenCalled();
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('upserts the seeded admin Google grant with the consent scopes', async () => {
        const store = createStore();
        await seedGoogleGrant('test-token', store);
        expect(store.upsert).toHaveBeenCalledExactlyOnceWith({
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            provider: OpenIdIdentityIssuerType.GOOGLE,
            subject: 'rainbow-sheets-test',
            email: 'rainbow-sheets-test@example.invalid',
            scopes,
            refreshToken: 'test-token',
        });
    });

    it('leaves an unchanged grant alone and updates it after rotation', async () => {
        const store = createStore();
        store.find.mockResolvedValue({
            provider_subject: 'rainbow-sheets-test',
            encrypted_refresh_token: Buffer.from('ciphertext'),
            scopes,
        });
        store.decrypt.mockReturnValue('old-token');
        await seedGoogleGrant('old-token', store);
        expect(store.upsert).not.toHaveBeenCalled();
        await seedGoogleGrant('new-token', store);
        expect(store.upsert).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ refreshToken: 'new-token' }),
        );
    });

    it('keeps a grant that was connected in the UI', async () => {
        const store = createStore();
        store.find.mockResolvedValue({
            provider_subject: 'google-account-subject',
            encrypted_refresh_token: Buffer.from('ciphertext'),
            scopes,
        });
        await seedGoogleGrant('test-token', store);
        expect(store.upsert).not.toHaveBeenCalled();
    });

    it('replaces a seeded grant if it cannot be decrypted', async () => {
        const store = createStore();
        store.find.mockResolvedValue({
            provider_subject: 'rainbow-sheets-test',
            encrypted_refresh_token: Buffer.from('ciphertext'),
            scopes,
        });
        store.decrypt.mockImplementation(() => {
            throw new Error('Cannot decrypt');
        });
        await seedGoogleGrant('new-token', store);
        expect(store.upsert).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ refreshToken: 'new-token' }),
        );
    });
});

describe('readConnectedGoogleGrant', () => {
    it('reads a manually connected grant with only the consent scopes', async () => {
        const store = createStore();
        const encryptedRefreshToken = Buffer.from('ciphertext');
        store.find.mockResolvedValue({
            provider_subject: 'google-account-subject',
            encrypted_refresh_token: encryptedRefreshToken,
            scopes: [...scopes].reverse(),
        });
        store.decrypt.mockReturnValue('test-token');
        await expect(readConnectedGoogleGrant(store)).resolves.toBe(
            'test-token',
        );
        expect(store.decrypt).toHaveBeenCalledExactlyOnceWith(
            encryptedRefreshToken,
        );
    });

    it.each([
        ['rainbow-sheets-test', scopes],
        ['google-account-subject', [...scopes, 'extra-scope']],
    ])(
        'rejects an unsuitable grant without decrypting it',
        async (subject, grantScopes) => {
            const store = createStore();
            store.find.mockResolvedValue({
                provider_subject: subject,
                encrypted_refresh_token: Buffer.from('ciphertext'),
                scopes: grantScopes,
            });
            await expect(readConnectedGoogleGrant(store)).rejects.toThrow(
                'GOOGLE_GRANT_NOT_CONNECTED',
            );
            expect(store.decrypt).not.toHaveBeenCalled();
        },
    );
});

describe('runGoogleGrant', () => {
    const args = {
        action: 'seed',
        refreshToken: 'test-token',
        mode: 'pr',
        interactive: false,
    };

    it('returns without configuration when the seed has no secret', async () => {
        await expect(
            runGoogleGrant({
                ...args,
                refreshToken: undefined,
                mode: undefined,
            }),
        ).resolves.toBeUndefined();
    });

    it.each([
        [{ mode: 'production' }, 'GOOGLE_GRANT_PREVIEW_ONLY'],
        [{ action: 'other' }, 'GOOGLE_GRANT_INVALID_ACTION'],
        [
            { action: 'export', interactive: true },
            'GOOGLE_GRANT_INTERACTIVE_EXPORT',
        ],
    ])('rejects an unsupported invocation', async (overrides, code) => {
        await expect(runGoogleGrant({ ...args, ...overrides })).rejects.toThrow(
            code,
        );
    });
});

describe('validateGoogleGrant', () => {
    const client = {
        oauth2ClientId: 'test-client',
        oauth2ClientSecret: 'test-secret',
    };

    it('mints an access token for the guest client', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json({ access_token: 'test-access' }));
        await expect(
            validateGoogleGrant('test-refresh', client, request),
        ).resolves.toBeUndefined();
        expect(request).toHaveBeenCalledExactlyOnceWith(
            'https://oauth2.googleapis.com/token',
            expect.objectContaining({ method: 'POST', redirect: 'error' }),
        );
        const body = request.mock.calls[0][1]?.body as URLSearchParams;
        expect(Object.fromEntries(body)).toEqual({
            client_id: 'test-client',
            client_secret: 'test-secret',
            grant_type: 'refresh_token',
            refresh_token: 'test-refresh',
        });
    });

    it('fails closed when Google refuses the grant without reading its body', async () => {
        const response = Response.json(
            { error: 'invalid_grant' },
            { status: 400 },
        );
        const request = vi.fn<typeof fetch>().mockResolvedValue(response);
        await expect(
            validateGoogleGrant('test-refresh', client, request),
        ).rejects.toThrow('GOOGLE_GRANT_REFRESH_REJECTED');
        expect(response.bodyUsed).toBe(false);
    });

    it('rejects a success response with no access token', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json({}));
        await expect(
            validateGoogleGrant('test-refresh', client, request),
        ).rejects.toThrow('GOOGLE_GRANT_ACCESS_TOKEN_MISSING');
    });
});

describe('exportGoogleGrant', () => {
    const client = {
        oauth2ClientId: 'test-client',
        oauth2ClientSecret: 'test-secret',
    };
    const connectedStore = () => {
        const store = createStore();
        store.find.mockResolvedValue({
            provider_subject: 'google-account-subject',
            encrypted_refresh_token: Buffer.from('ciphertext'),
            scopes,
        });
        store.decrypt.mockReturnValue('test-refresh');
        return store;
    };

    it('waits for Google to issue an access token before exporting the grant', async () => {
        const started = Promise.withResolvers<void>();
        const response = Promise.withResolvers<Response>();
        const request = vi.fn<typeof fetch>().mockImplementation(() => {
            started.resolve();
            return response.promise;
        });
        const onExport = vi.fn<(token: string) => void>();
        const result = exportGoogleGrant(connectedStore(), client, request);
        const completed = result.then(onExport);

        await Promise.race([started.promise, completed]);
        expect(request).toHaveBeenCalledTimes(1);
        expect(onExport).not.toHaveBeenCalled();

        response.resolve(Response.json({ access_token: 'test-access' }));
        await completed;
        expect(onExport).toHaveBeenCalledExactlyOnceWith('test-refresh');
    });

    it('does not return the grant if Google refuses it', async () => {
        const request = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                Response.json({ error: 'invalid_grant' }, { status: 400 }),
            );
        await expect(
            exportGoogleGrant(connectedStore(), client, request),
        ).rejects.toThrow('GOOGLE_GRANT_REFRESH_REJECTED');
    });
});

describe('getGoogleGrantErrorFields', () => {
    it('logs an error name and code without accepting an arbitrary message', () => {
        expect(
            getGoogleGrantErrorFields(
                Object.assign(new TypeError('test-refresh'), {
                    code: 'ECONNREFUSED',
                }),
            ),
        ).toEqual({ name: 'TypeError', code: 'ECONNREFUSED' });
        expect(
            getGoogleGrantErrorFields(
                Object.assign(new TypeError('test-refresh'), {
                    name: 'test-refresh',
                    code: 'test-refresh',
                }),
            ),
        ).toEqual({ name: 'UnknownError', code: 'unknown' });
    });
});

import { OpenIdIdentityIssuerType, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { readConnectedGoogleGrant, seedGoogleGrant } from './googleGrant';

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
                'No manually connected Google Sheets grant',
            );
            expect(store.decrypt).not.toHaveBeenCalled();
        },
    );
});

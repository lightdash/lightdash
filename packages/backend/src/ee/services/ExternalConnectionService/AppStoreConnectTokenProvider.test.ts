import { toAppStoreConnectSecret } from '@lightdash/common';
import {
    decodeProtectedHeader,
    exportPKCS8,
    generateKeyPair,
    jwtVerify,
    type KeyLike,
} from 'jose';
import { AppStoreConnectTokenProvider } from './AppStoreConnectTokenProvider';

const KEY_ID = 'ABCDE12345';
const ISSUER_ID = '00000000-1111-2222-3333-444444444444';
const START = Date.parse('2026-11-24T10:00:00Z');

let publicKey: KeyLike;
let secret: string;

beforeAll(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    publicKey = pair.publicKey;
    secret = toAppStoreConnectSecret({
        keyId: KEY_ID,
        issuerId: ISSUER_ID,
        privateKey: await exportPKCS8(pair.privateKey),
    });
});

const clock = () => {
    let now = START;
    return {
        now: () => now,
        advance: (ms: number) => {
            now += ms;
        },
    };
};

describe('AppStoreConnectTokenProvider', () => {
    it('signs a token Apple accepts: ES256, key ID, issuer, audience, at most 20 minutes', async () => {
        const time = clock();
        const provider = new AppStoreConnectTokenProvider(time.now);

        const token = await provider.getToken(secret);

        expect(decodeProtectedHeader(token)).toEqual({
            alg: 'ES256',
            kid: KEY_ID,
            typ: 'JWT',
        });
        const { payload } = await jwtVerify(token, publicKey, {
            issuer: ISSUER_ID,
            audience: 'appstoreconnect-v1',
            currentDate: new Date(START),
        });
        expect(payload.iat).toBe(START / 1000);
        expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(20 * 60);
        expect(payload.exp! - payload.iat!).toBeGreaterThan(0);
    });

    it('reuses the token until shortly before it expires, then signs a new one', async () => {
        const time = clock();
        const provider = new AppStoreConnectTokenProvider(time.now);

        const first = await provider.getToken(secret);
        time.advance(12 * 60_000);
        expect(await provider.getToken(secret)).toBe(first);

        time.advance(60_000);
        const second = await provider.getToken(secret);
        expect(second).not.toBe(first);
        const { payload } = await jwtVerify(second, publicKey, {
            currentDate: new Date(time.now()),
        });
        expect(payload.iat).toBe((START + 13 * 60_000) / 1000);
    });

    it('refuses a secret that is not an App Store Connect key', async () => {
        const provider = new AppStoreConnectTokenProvider();

        await expect(provider.getToken('not json')).rejects.toThrow();
        await expect(
            provider.getToken(
                JSON.stringify({
                    keyId: KEY_ID,
                    issuerId: ISSUER_ID,
                    privateKey:
                        '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----',
                }),
            ),
        ).rejects.toThrow();
    });
});

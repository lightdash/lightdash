import {
    sensitiveCredentialsFieldNames,
    WarehouseTypes,
} from '@lightdash/common';
import { CredentialCodec, CredentialCodecError } from './credentialCodec';
import { codecCases, createEncryptionUtil } from './credentialCodec.mock';

const leaves = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object')
        return Object.values(value).flatMap(leaves);
    return [];
};
const keys = (value: unknown): string[] => {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, nested]) => [
        key,
        ...keys(nested),
    ]);
};

describe('CredentialCodec', () => {
    const encryptionUtil = createEncryptionUtil();
    const codec = new CredentialCodec(encryptionUtil);
    test.each(codecCases)(
        'round trips $purpose / $warehouseType / $authMode without secret identity fields',
        (input) => {
            const encoded = codec.encodeCredential(input);
            expect(encoded.identity).toEqual(input.identity);
            expect(
                codec.decodeSecrets(input, encoded.encryptedSecrets),
            ).toEqual({
                secrets: input.secrets,
                keySource: { type: 'active' },
            });
            for (const secret of leaves(input.secrets)) {
                expect(JSON.stringify(encoded.identity)).not.toContain(secret);
                expect(encoded.encryptedSecrets.toString()).not.toContain(
                    secret,
                );
            }
            const secretKeys = sensitiveCredentialsFieldNames.filter(
                (key) => key !== 'user' && key !== 'oauthClientId',
            );
            expect(
                keys(encoded.identity).filter((key) =>
                    (secretKeys as readonly string[]).includes(key),
                ),
            ).toEqual([]);
            expect(() =>
                codec.encodeCredential({
                    ...input,
                    identity: {
                        ...input.identity,
                        password: 'misplaced-secret',
                    },
                }),
            ).toThrow(CredentialCodecError);
            expect(() =>
                codec.encodeCredential({
                    ...input,
                    identity: { ...input.identity, host: 'routing-host' },
                }),
            ).toThrow(CredentialCodecError);
            expect(() =>
                codec.encodeCredential({
                    ...input,
                    secrets: { ...input.secrets, unexpected: 'extra' },
                }),
            ).toThrow(CredentialCodecError);
        },
    );
    test.each([{}, { token: null }, { token: 'secret-access-token' }])(
        'allows only an optional nullable access token for BigQuery SSO: %j',
        (secrets) => {
            const input = {
                purpose: 'personal_sign_in' as const,
                warehouseType: WarehouseTypes.BIGQUERY,
                authMode: 'sso',
                identity: {},
                secrets,
            };
            const encoded = codec.encodeCredential(input);
            expect(
                codec.decodeSecrets(input, encoded.encryptedSecrets).secrets,
            ).toEqual(secrets);
        },
    );
    test.each(['client_secret', 'refresh_token'])(
        'rejects %s in BigQuery SSO secrets',
        (field) => {
            const input = {
                purpose: 'personal_sign_in' as const,
                warehouseType: WarehouseTypes.BIGQUERY,
                authMode: 'sso',
                identity: {},
                secrets: {
                    token: 'secret-access-token',
                    [field]: 'forbidden-secret',
                },
            };
            expect(() => codec.encodeCredential(input)).toThrow(
                expect.objectContaining({ code: 'invalid_secrets' }),
            );
            expect(() =>
                codec.decodeSecrets(
                    input,
                    encryptionUtil.encrypt(JSON.stringify(input.secrets)),
                ),
            ).toThrow(expect.objectContaining({ code: 'invalid_secrets' }));
        },
    );
    test('rejects unknown combinations', () => {
        for (const input of [
            { ...codecCases[0], authMode: 'unknown' },
            { ...codecCases[0], warehouseType: null },
            {
                ...codecCases[0],
                purpose: 'ssh_key_pair' as const,
                warehouseType: WarehouseTypes.SNOWFLAKE,
            },
        ])
            expect(() => codec.encodeCredential(input)).toThrow(
                expect.objectContaining({ code: 'unknown_mode' }),
            );
    });
    test('reports fallback decryption for secrets and token state', () => {
        const reader = new CredentialCodec(
            createEncryptionUtil('next-test-key', ['active-test-key']),
        );
        const input = codecCases[0];
        expect(
            reader.decodeSecrets(
                input,
                codec.encodeCredential(input).encryptedSecrets,
            ),
        ).toEqual({
            secrets: input.secrets,
            keySource: { type: 'fallback', index: 0 },
        });
        const encrypted = codec.encodeRefreshToken('secret-refresh');
        expect(encryptionUtil.decrypt(encrypted)).toBe(
            '{"refreshToken":"secret-refresh"}',
        );
        expect(reader.decodeRefreshToken(encrypted)).toEqual({
            refreshToken: 'secret-refresh',
            keySource: { type: 'fallback', index: 0 },
        });
    });
    test('returns typed errors for corrupt JSON, invalid decrypted schemas and unreadable ciphertext', () => {
        expect(() =>
            codec.decodeSecrets(codecCases[0], encryptionUtil.encrypt('{bad')),
        ).toThrow(expect.objectContaining({ code: 'invalid_json' }));
        expect(() =>
            codec.decodeSecrets(
                codecCases[0],
                encryptionUtil.encrypt('{"token":"wrong-mode"}'),
            ),
        ).toThrow(expect.objectContaining({ code: 'invalid_secrets' }));
        expect(() =>
            codec.decodeSecrets(codecCases[0], Buffer.from('broken')),
        ).toThrow(expect.objectContaining({ code: 'decryption_failed' }));
        expect(() =>
            codec.decodeRefreshToken(
                encryptionUtil.encrypt(
                    '{"refreshToken":"secret","extra":true}',
                ),
            ),
        ).toThrow(CredentialCodecError);
    });
});

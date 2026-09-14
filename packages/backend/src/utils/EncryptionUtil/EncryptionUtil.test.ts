import { EncryptionUtil } from './EncryptionUtil';

const configWithSecrets = (active: string, ...fallbacks: string[]) => ({
    lightdashSecret: active,
    lightdashSecrets: {
        active,
        fallbacks,
        all: [active, ...fallbacks],
    },
});

test('Message is unchanged by encryption and decryption', () => {
    const service = new EncryptionUtil({
        lightdashConfig: configWithSecrets('secret'),
    });
    const message = 'extremely secret';
    expect(service.decrypt(service.encrypt(message))).toStrictEqual(message);
});

describe('secret keyring', () => {
    const message = 'extremely secret';
    const oldOnly = new EncryptionUtil({
        lightdashConfig: configWithSecrets('old secret'),
    });
    const newOnly = new EncryptionUtil({
        lightdashConfig: configWithSecrets('new secret'),
    });
    const newActiveOldFallback = new EncryptionUtil({
        lightdashConfig: configWithSecrets('new secret', 'old secret'),
    });
    const oldActiveNewFallback = new EncryptionUtil({
        lightdashConfig: configWithSecrets('old secret', 'new secret'),
    });

    test('encrypt uses only the active secret', () => {
        const encrypted = newActiveOldFallback.encrypt(message);
        expect(newOnly.decrypt(encrypted)).toStrictEqual(message);
        expect(() => oldOnly.decrypt(encrypted)).toThrow();
    });

    test('decrypts fallback ciphertext under both orderings', () => {
        const oldCiphertext = oldOnly.encrypt(message);
        const newCiphertext = newOnly.encrypt(message);
        expect(newActiveOldFallback.decrypt(oldCiphertext)).toStrictEqual(
            message,
        );
        expect(newActiveOldFallback.decrypt(newCiphertext)).toStrictEqual(
            message,
        );
        expect(oldActiveNewFallback.decrypt(oldCiphertext)).toStrictEqual(
            message,
        );
        expect(oldActiveNewFallback.decrypt(newCiphertext)).toStrictEqual(
            message,
        );
    });

    test('decryptWithMeta reports the active key', () => {
        const encrypted = newActiveOldFallback.encrypt(message);
        expect(newActiveOldFallback.decryptWithMeta(encrypted)).toStrictEqual({
            value: message,
            keySource: { type: 'active' },
        });
    });

    test('decryptWithMeta reports the fallback index', () => {
        const withTwoFallbacks = new EncryptionUtil({
            lightdashConfig: configWithSecrets(
                'new secret',
                'unrelated secret',
                'old secret',
            ),
        });
        expect(
            withTwoFallbacks.decryptWithMeta(oldOnly.encrypt(message)),
        ).toStrictEqual({
            value: message,
            keySource: { type: 'fallback', index: 1 },
        });
    });

    test('rethrows the active attempt error when no candidate matches', () => {
        const encrypted = new EncryptionUtil({
            lightdashConfig: configWithSecrets('unknown secret'),
        }).encrypt(message);
        let activeOnlyError: unknown;
        try {
            newOnly.decrypt(encrypted);
        } catch (error) {
            activeOnlyError = error;
        }
        expect(activeOnlyError).toBeInstanceOf(Error);
        expect(() => newActiveOldFallback.decrypt(encrypted)).toThrowError(
            (activeOnlyError as Error).message,
        );
    });

    test('rejects tampered ciphertext', () => {
        const encrypted = newActiveOldFallback.encrypt(message);
        encrypted[encrypted.length - 1] = 255 - encrypted[encrypted.length - 1];
        expect(() => newActiveOldFallback.decrypt(encrypted)).toThrow();
    });

    test('rejects a malformed envelope', () => {
        expect(() =>
            newActiveOldFallback.decrypt(Buffer.from('too short')),
        ).toThrow();
    });
});

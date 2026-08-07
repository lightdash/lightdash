import { createHmac } from 'crypto';
import {
    getAuthenticationToken,
    isValidAuthenticationToken,
} from './headlessBrowser';

vi.mock('../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            lightdashSecrets: {
                active: 'new secret',
                fallbacks: ['old secret'],
                all: ['new secret', 'old secret'],
            },
        },
    };
});

const hmacFor = (secret: string, value: string) =>
    createHmac('sha512', secret).update(value).digest('hex');

describe('headless browser authentication token', () => {
    const userUuid = 'a2c62b2d-8bb7-44b8-8d65-dbc9d78e79f0';

    test('generates tokens with the active secret only', () => {
        expect(getAuthenticationToken(userUuid)).toEqual(
            hmacFor('new secret', userUuid),
        );
    });

    test('accepts a token derived from the active secret', () => {
        expect(
            isValidAuthenticationToken(
                userUuid,
                hmacFor('new secret', userUuid),
            ),
        ).toBe(true);
    });

    test('accepts a token derived from a fallback secret', () => {
        expect(
            isValidAuthenticationToken(
                userUuid,
                hmacFor('old secret', userUuid),
            ),
        ).toBe(true);
    });

    test('accepts a valid token in uppercase hex', () => {
        expect(
            isValidAuthenticationToken(
                userUuid,
                hmacFor('new secret', userUuid).toUpperCase(),
            ),
        ).toBe(true);
    });

    test('rejects a token derived from an unknown secret', () => {
        expect(
            isValidAuthenticationToken(
                userUuid,
                hmacFor('unknown secret', userUuid),
            ),
        ).toBe(false);
    });

    test('rejects a token derived for a different value', () => {
        expect(
            isValidAuthenticationToken(
                userUuid,
                hmacFor('new secret', 'other-user-uuid'),
            ),
        ).toBe(false);
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
        ['a number', 123],
        ['an object', { token: 'nested' }],
        ['an array', ['a'.repeat(128)]],
        ['an empty string', ''],
        ['a short hex string', 'ab'.repeat(63)],
        ['an odd-length hex string', 'a'.repeat(127)],
        ['a long hex string', 'ab'.repeat(65)],
        ['a non-hex string of the right length', 'z'.repeat(128)],
    ])('rejects %s without throwing', (_label, token) => {
        expect(isValidAuthenticationToken(userUuid, token)).toBe(false);
    });
});

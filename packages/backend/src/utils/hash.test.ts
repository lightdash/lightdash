import {
    deprecatedHash,
    deriveTokenHashSalt,
    hash,
    hashWithSecret,
} from './hash';

const ENV_KEYS = ['LIGHTDASH_SECRET'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
    {};

beforeEach(() => {
    ENV_KEYS.forEach((key) => {
        savedEnv[key] = process.env[key];
    });
});

afterEach(() => {
    ENV_KEYS.forEach((key) => {
        if (savedEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = savedEnv[key];
        }
    });
});

describe('deriveTokenHashSalt', () => {
    test('produces a deterministic bcrypt-format salt', () => {
        const salt = deriveTokenHashSalt('some secret');
        expect(salt).toMatch(/^\$2b\$10\$[./A-Za-z0-9]{22}$/);
        expect(deriveTokenHashSalt('some secret')).toEqual(salt);
        expect(deriveTokenHashSalt('other secret')).not.toEqual(salt);
    });
});

describe('hashWithSecret', () => {
    test('is deterministic per token and secret', async () => {
        const first = await hashWithSecret('token', 'secret-a');
        expect(await hashWithSecret('token', 'secret-a')).toEqual(first);
        expect(await hashWithSecret('token', 'secret-b')).not.toEqual(first);
        expect(await hashWithSecret('other', 'secret-a')).not.toEqual(first);
    });
});

describe('hash', () => {
    test('hashes with the LIGHTDASH_SECRET environment variable', async () => {
        process.env.LIGHTDASH_SECRET = 'env secret';
        expect(await hash('token')).toEqual(
            await hashWithSecret('token', 'env secret'),
        );
    });
});

describe('deprecatedHash', () => {
    test('remains the plain sha256 hex of the token', () => {
        expect(deprecatedHash('token')).toEqual(
            '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0',
        );
    });
});

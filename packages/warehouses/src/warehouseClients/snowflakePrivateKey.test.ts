import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import {
    normalizeSnowflakePrivateKey,
    SNOWFLAKE_PRIVATE_KEY_NOT_RSA_MESSAGE,
    SNOWFLAKE_PRIVATE_KEY_OPENSSH_MESSAGE,
    SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_INCORRECT_MESSAGE,
    SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_REQUIRED_MESSAGE,
    SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE,
    SnowflakePrivateKeyError,
} from './snowflakePrivateKey';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const passphrase = 'throwaway-passphrase';
const pkcs8 = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const pkcs1 = privateKey.export({ format: 'pem', type: 'pkcs1' }).toString();
const encrypted = privateKey
    .export({
        format: 'pem',
        type: 'pkcs8',
        cipher: 'aes-256-cbc',
        passphrase,
    })
    .toString();
const body = (pem: string) =>
    pem
        .split('\n')
        .filter((line) => line && !line.startsWith('-----'))
        .join('');
const underRsaHeader = (pem: string) =>
    pem.replace(
        /-----(BEGIN|END) (?:ENCRYPTED )?PRIVATE KEY-----/g,
        '-----$1 RSA PRIVATE KEY-----',
    );
const snowflakeSdkUtil = createRequire(__filename)(
    'snowflake-sdk/dist/lib/util',
) as { isPrivateKey: (key: string) => boolean };
const snowflakeSdkAccepts = (pem: string) => snowflakeSdkUtil.isPrivateKey(pem);

describe('normalizeSnowflakePrivateKey', () => {
    it.each([
        ['PKCS#8', pkcs8, undefined],
        ['PKCS#1', pkcs1, undefined],
        ['PKCS#8 body under an RSA header', underRsaHeader(pkcs8), undefined],
        [
            'encrypted body under an RSA header with its passphrase',
            underRsaHeader(encrypted),
            passphrase,
        ],
        ['encrypted PKCS#8 with its passphrase', encrypted, passphrase],
        [
            'one-line paste with typed headers',
            `-----BEGIN PRIVATE KEY----- ${body(pkcs8)} -----END PRIVATE KEY-----`,
            undefined,
        ],
        [
            'space before the footer',
            pkcs8.trim().replace('\n-----END', ' -----END'),
            undefined,
        ],
        [
            'tab before the footer',
            pkcs8.trim().replace('\n-----END', '\t-----END'),
            undefined,
        ],
        ['CRLF line endings', pkcs8.replace(/\n/g, '\r\n'), undefined],
        ['bare base64 body', body(pkcs8), undefined],
        ['CR-only line endings', pkcs8.replace(/\n/g, '\r'), undefined],
        [
            'literal backslash-n sequences',
            pkcs8.trim().replace(/\n/g, '\\n'),
            undefined,
        ],
        [
            'literal backslash-r-backslash-n sequences',
            pkcs8.trim().replace(/\n/g, '\\r\\n'),
            undefined,
        ],
        [
            'no newline before the footer',
            pkcs8.trim().replace('\n-----END', '-----END'),
            undefined,
        ],
        ['surrounding whitespace', `  \n${pkcs8}\n  `, undefined],
        ['surrounding double quotes', `"${pkcs8.trim()}"`, undefined],
        ['surrounding single quotes', `'${pkcs8.trim()}'`, undefined],
        ['a JSON string literal', JSON.stringify(pkcs8.trim()), undefined],
        [
            'text before the header',
            `Bag Attributes\n    localKeyID: 01\n${pkcs8}`,
            undefined,
        ],
        ['text after the footer', `${pkcs8}note\n`, undefined],
        [
            'indented lines',
            pkcs8
                .split('\n')
                .map((line) => `  ${line}`)
                .join('\n'),
            undefined,
        ],
    ])('loads %s as unencrypted PKCS#8', (_name, key, keyPassphrase) => {
        const normalized = normalizeSnowflakePrivateKey(key, keyPassphrase);
        expect(normalized).toBe(pkcs8);
        expect(snowflakeSdkAccepts(normalized)).toBe(true);
        expect(createPrivateKey(normalized).asymmetricKeyType).toBe('rsa');
    });

    it.each([
        [
            'encrypted with no passphrase',
            encrypted,
            undefined,
            SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_REQUIRED_MESSAGE,
        ],
        [
            'encrypted under an RSA header with no passphrase',
            underRsaHeader(encrypted),
            undefined,
            SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_REQUIRED_MESSAGE,
        ],
        [
            'encrypted with the wrong passphrase',
            encrypted,
            'not-the-passphrase',
            SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_INCORRECT_MESSAGE,
        ],
        [
            'garbage',
            '-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----',
            undefined,
            SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE,
        ],
        [
            'a truncated body',
            pkcs8.slice(0, 200),
            undefined,
            SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE,
        ],
        [
            'a public key',
            generateKeyPairSync('rsa', { modulusLength: 2048 })
                .publicKey.export({ format: 'pem', type: 'spki' })
                .toString(),
            undefined,
            SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE,
        ],
        [
            'an OpenSSH key',
            '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU=\n-----END OPENSSH PRIVATE KEY-----\n',
            undefined,
            SNOWFLAKE_PRIVATE_KEY_OPENSSH_MESSAGE,
        ],
        [
            'an EC key',
            generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
                .privateKey.export({ format: 'pem', type: 'pkcs8' })
                .toString(),
            undefined,
            SNOWFLAKE_PRIVATE_KEY_NOT_RSA_MESSAGE,
        ],
    ])('rejects %s', (_name, key, keyPassphrase, message) => {
        let thrown: unknown;
        try {
            normalizeSnowflakePrivateKey(key, keyPassphrase);
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(SnowflakePrivateKeyError);
        expect((thrown as Error).message).toBe(message);
        expect(JSON.stringify(thrown)).not.toContain(body(key).slice(0, 20));
    });

    it('rejects oversized input before parsing it', () => {
        const oversized = `${pkcs8}${'A'.repeat(16 * 1024)}`;
        const started = Date.now();
        let thrown: unknown;
        try {
            normalizeSnowflakePrivateKey(oversized);
        } catch (error) {
            thrown = error;
        }
        expect(Date.now() - started).toBeLessThan(50);
        expect(thrown).toBeInstanceOf(SnowflakePrivateKeyError);
        expect((thrown as Error).message).toBe(
            SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE,
        );
        expect(JSON.stringify(thrown)).not.toContain(body(pkcs8).slice(0, 20));
        expect(String(thrown)).not.toContain('AAAAAAAA');
    });
});

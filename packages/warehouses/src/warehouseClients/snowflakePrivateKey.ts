import { ParameterError } from '@lightdash/common';
import * as crypto from 'crypto';

export const SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE =
    'The private key could not be read. Paste the whole .p8 file, including its BEGIN and END lines. If the key is encrypted, enter its passphrase.';

export const SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_REQUIRED_MESSAGE =
    'The private key is encrypted. Enter its passphrase.';

export const SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_INCORRECT_MESSAGE =
    'The passphrase does not unlock the private key.';

export const SNOWFLAKE_PRIVATE_KEY_NOT_RSA_MESSAGE =
    'Snowflake key-pair authentication needs an RSA private key.';

export const SNOWFLAKE_PRIVATE_KEY_OPENSSH_MESSAGE =
    'OpenSSH private keys are not supported. Export the key as a PKCS#8 .p8 file.';

export class SnowflakePrivateKeyError extends ParameterError {}

const MAX_PRIVATE_KEY_LENGTH = 16 * 1024;

const PEM_LABELS = ['PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'RSA PRIVATE KEY'];

const MISSING_PASSPHRASE_CODES = new Set([
    'ERR_MISSING_PASSPHRASE',
    'ERR_OSSL_CRYPTO_INTERRUPTED_OR_CANCELLED',
]);

type LoadFailure = 'missing_passphrase' | 'bad_decrypt' | 'unreadable';

const wrapPem = (label: string, body: string): string =>
    `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END ${label}-----\n`;

const tryLoad = (
    key: string,
    passphrase: string | undefined,
): crypto.KeyObject | LoadFailure => {
    try {
        return crypto.createPrivateKey({
            key,
            format: 'pem',
            ...(passphrase ? { passphrase } : {}),
        });
    } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code && MISSING_PASSPHRASE_CODES.has(code))
            return 'missing_passphrase';
        if (code === 'ERR_OSSL_BAD_DECRYPT') return 'bad_decrypt';
        return 'unreadable';
    }
};

const failureMessage = (
    failures: Set<LoadFailure>,
    passphrase: string | undefined,
): string => {
    if (!passphrase && failures.has('missing_passphrase'))
        return SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_REQUIRED_MESSAGE;
    if (passphrase && failures.has('bad_decrypt'))
        return SNOWFLAKE_PRIVATE_KEY_PASSPHRASE_INCORRECT_MESSAGE;
    return SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE;
};

export const normalizeSnowflakePrivateKey = (
    privateKey: string,
    passphrase?: string,
): string => {
    if (privateKey.length > MAX_PRIVATE_KEY_LENGTH)
        throw new SnowflakePrivateKeyError(
            SNOWFLAKE_PRIVATE_KEY_UNREADABLE_MESSAGE,
        );
    const unquoted = privateKey.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    const pem = unquoted.replace(/\\r\\n|\\n|\\r/g, '\n').trim();
    if (pem.includes('BEGIN OPENSSH PRIVATE KEY'))
        throw new SnowflakePrivateKeyError(
            SNOWFLAKE_PRIVATE_KEY_OPENSSH_MESSAGE,
        );
    const body = pem
        .replace(/-----(?:BEGIN|END)[A-Z0-9 ]*-----/g, '')
        .replace(/\s+/g, '');
    const candidates = [
        pem,
        ...(/^[A-Za-z0-9+/]+={0,2}$/.test(body)
            ? PEM_LABELS.map((label) => wrapPem(label, body))
            : []),
    ];
    const failures = new Set<LoadFailure>();
    for (const candidate of candidates) {
        const loaded = tryLoad(candidate, passphrase);
        if (typeof loaded === 'string') {
            failures.add(loaded);
        } else if (loaded.asymmetricKeyType !== 'rsa') {
            throw new SnowflakePrivateKeyError(
                SNOWFLAKE_PRIVATE_KEY_NOT_RSA_MESSAGE,
            );
        } else {
            return loaded.export({ format: 'pem', type: 'pkcs8' }).toString();
        }
    }
    throw new SnowflakePrivateKeyError(failureMessage(failures, passphrase));
};

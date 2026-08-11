import {
    createCipheriv,
    createDecipheriv,
    pbkdf2Sync,
    randomBytes,
} from 'crypto';
import { LightdashConfig } from '../../config/parseConfig';

type EncryptionUtilArguments = {
    lightdashConfig: Pick<
        LightdashConfig,
        'lightdashSecret' | 'lightdashSecrets'
    >;
};

export type DecryptionKeySource =
    | { type: 'active' }
    | { type: 'fallback'; index: number };

export type DecryptionResult = {
    value: string;
    keySource: DecryptionKeySource;
};

export class EncryptionUtil {
    lightdashConfig: Pick<
        LightdashConfig,
        'lightdashSecret' | 'lightdashSecrets'
    >;

    algorithm: 'aes-256-gcm' = 'aes-256-gcm';

    keyDigest: 'sha512' = 'sha512';

    keyIterations: number = 2000;

    keyLength: number = 32;

    inputEncoding: 'utf-8' = 'utf-8';

    aesAuthTagLength: number = 16;

    saltLength: number = 64;

    ivLength: number = 12;

    saltOffset: number;

    tagOffset: number;

    ivOffset: number;

    messageOffset: number;

    constructor({ lightdashConfig }: EncryptionUtilArguments) {
        this.lightdashConfig = lightdashConfig;
        this.saltOffset = 0;
        this.tagOffset = this.saltLength;
        this.ivOffset = this.saltLength + this.aesAuthTagLength;
        this.messageOffset =
            this.saltLength + this.aesAuthTagLength + this.ivLength;
    }

    encrypt(message: string): Buffer {
        const iv = randomBytes(this.ivLength);
        const salt = randomBytes(this.saltLength);
        const key = pbkdf2Sync(
            this.lightdashConfig.lightdashSecrets.active,
            salt,
            this.keyIterations,
            this.keyLength,
            this.keyDigest,
        );
        const cipher = createCipheriv(this.algorithm, key, iv, {
            authTagLength: this.aesAuthTagLength,
        });
        const encrypted: Buffer = Buffer.concat([
            cipher.update(message, this.inputEncoding),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([salt, tag, iv, encrypted]);
    }

    decrypt(encrypted: Buffer): string {
        return this.decryptWithMeta(encrypted).value;
    }

    // Tries the active secret first, then each fallback in order. When every
    // candidate fails, the active attempt's error is rethrown so existing
    // catch behavior and error grouping are preserved.
    decryptWithMeta(encrypted: Buffer): DecryptionResult {
        const salt = encrypted.slice(this.saltOffset, this.tagOffset);
        const tag = encrypted.slice(this.tagOffset, this.ivOffset);
        const iv = encrypted.slice(this.ivOffset, this.messageOffset);
        const encryptedMessage = encrypted.slice(this.messageOffset);
        const candidates = this.lightdashConfig.lightdashSecrets.all;
        let activeError: unknown;
        for (let i = 0; i < candidates.length; i += 1) {
            try {
                const key = pbkdf2Sync(
                    candidates[i],
                    salt,
                    this.keyIterations,
                    this.keyLength,
                    this.keyDigest,
                );
                const decipher = createDecipheriv(this.algorithm, key, iv, {
                    authTagLength: this.aesAuthTagLength,
                });
                decipher.setAuthTag(tag);
                const value = `${decipher.update(
                    encryptedMessage,
                    undefined,
                    this.inputEncoding,
                )}${decipher.final()}`;
                return {
                    value,
                    keySource:
                        i === 0
                            ? { type: 'active' }
                            : { type: 'fallback', index: i - 1 },
                };
            } catch (error) {
                if (i === 0) {
                    activeError = error;
                }
            }
        }
        throw activeError;
    }
}

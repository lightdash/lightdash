import {
    createCipheriv,
    createDecipheriv,
    createPrivateKey,
    pbkdf2Sync,
    randomBytes,
} from 'crypto';
import { LightdashConfig } from '../../config/parseConfig';

type EncryptionUtilArguments = {
    lightdashConfig: Pick<LightdashConfig, 'lightdashSecret'>;
};

export class EncryptionUtil {
    lightdashConfig: Pick<LightdashConfig, 'lightdashSecret'>;

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
            this.lightdashConfig.lightdashSecret,
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
        const salt = encrypted.slice(this.saltOffset, this.tagOffset);
        const tag = encrypted.slice(this.tagOffset, this.ivOffset);
        const iv = encrypted.slice(this.ivOffset, this.messageOffset);
        const encryptedMessage = encrypted.slice(this.messageOffset);
        const key = pbkdf2Sync(
            this.lightdashConfig.lightdashSecret,
            salt,
            this.keyIterations,
            this.keyLength,
            this.keyDigest,
        );
        const decipher = createDecipheriv(this.algorithm, key, iv, {
            authTagLength: this.aesAuthTagLength,
        });
        decipher.setAuthTag(tag);
        const message = `${decipher.update(
            encryptedMessage,
            undefined,
            this.inputEncoding,
        )}${decipher.final()}`;
        return message;
    }

    /**
     * Checks if a given key is encrypted. To make that determination:
     *
     *  1. Looks for common PEM encryption envelope headers (fast path).
     *  2. Attempts to parse the key without passphrase using Node.js crypto module.
     *
     *  Modern OpenSSH keys do not include explicit headers indicating encryption,
     *  so parsing is necessary to accurately determine their status.
     */
    static isKeyEncrypted(keyContent: string): boolean {
        if (!keyContent) {
            throw new Error('Invalid key content: must be a non-empty string');
        }

        const trimmedKey = keyContent.trim();

        // Check for traditional PEM format encryption markers
        if (
            trimmedKey.includes('Proc-Type: 4,ENCRYPTED') ||
            trimmedKey.includes('DEK-Info:')
        ) {
            return true;
        }

        // Check for encrypted PKCS#8 format
        if (trimmedKey.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')) {
            return true;
        }

        // Try parsing the key to confirm it's not encrypted
        // If parsing succeeds without a passphrase, the key is unencrypted
        try {
            createPrivateKey({ key: keyContent, format: 'pem' });
            return false;
        } catch (error) {
            const errorCode = (error as NodeJS.ErrnoException).code;
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

            // If the error indicates a missing passphrase, the key is encrypted
            if (
                errorMessage.includes('passphrase') ||
                errorMessage.includes('ENCRYPTED') ||
                errorCode === 'ERR_MISSING_PASSPHRASE'
            ) {
                return true;
            }

            // OpenSSH encrypted keys throw ERR_OSSL_UNSUPPORTED when parsed without passphrase
            // Check if this is an OpenSSH key with unsupported decoder error
            if (
                errorCode === 'ERR_OSSL_UNSUPPORTED' &&
                trimmedKey.includes('-----BEGIN OPENSSH PRIVATE KEY-----')
            ) {
                return true;
            }

            // Re-throw other errors as they indicate invalid key content
            throw new Error(`Unable to parse private key: ${errorMessage}`);
        }
    }
}

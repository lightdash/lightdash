import {
    createCipheriv,
    createDecipheriv,
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
            salt as Uint8Array,
            this.keyIterations,
            this.keyLength,
            this.keyDigest,
        );
        const cipher = createCipheriv(
            this.algorithm,
            Buffer.from(key),
            Buffer.from(iv),
            {
                authTagLength: this.aesAuthTagLength,
            },
        );
        const encrypted = Buffer.concat([
            Buffer.from(cipher.update(message, this.inputEncoding)),
            Buffer.from(cipher.final()),
        ]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([
            Buffer.from(salt),
            Buffer.from(tag),
            Buffer.from(iv),
            encrypted,
        ]);
    }

    decrypt(encrypted: Buffer): string {
        const salt = encrypted.slice(this.saltOffset, this.tagOffset);
        const tag = encrypted.slice(this.tagOffset, this.ivOffset);
        const iv = encrypted.slice(this.ivOffset, this.messageOffset);
        const encryptedMessage = encrypted.slice(this.messageOffset);
        const key = pbkdf2Sync(
            this.lightdashConfig.lightdashSecret,
            salt as Uint8Array,
            this.keyIterations,
            this.keyLength,
            this.keyDigest,
        );
        const decipher = createDecipheriv(
            this.algorithm,
            Buffer.from(key),
            Buffer.from(iv),
            {
                authTagLength: this.aesAuthTagLength,
            },
        );
        decipher.setAuthTag(Buffer.from(tag));
        const message = `${decipher.update(
            encryptedMessage,
            undefined,
            this.inputEncoding,
        )}${decipher.final(this.inputEncoding)}`;
        return message;
    }
}

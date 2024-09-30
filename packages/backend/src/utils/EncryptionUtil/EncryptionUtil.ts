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
}

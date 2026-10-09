import { SnowflakeAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { generateKeyPairSync } from 'node:crypto';

export const snowflakeKeyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
});
export const snowflakePrivateKey = snowflakeKeyPair.privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
export const snowflakePassphrase = ' passphrase with spaces ';
export const snowflakeEncryptedKey = snowflakeKeyPair.privateKey
    .export({
        format: 'pem',
        type: 'pkcs8',
        cipher: 'aes-256-cbc',
        passphrase: snowflakePassphrase,
    })
    .toString();
export const snowflakeSecrets = {
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
    user: 'SlotUser',
    role: 'SlotRole',
    warehouse: 'SlotWarehouse',
    privateKey: snowflakePrivateKey,
} as const;
export const snowflakeVerification = {
    ok: true,
    principal: 'OBSERVED_USER',
    observed: { currentUser: 'OBSERVED_USER', currentRole: 'OBSERVED_ROLE' },
    message: 'AI service account connection checked.',
    checkedAt: new Date('2026-10-09T12:00:00Z'),
};

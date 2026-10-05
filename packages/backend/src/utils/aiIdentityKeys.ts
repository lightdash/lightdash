import { createHash, generateKeyPairSync } from 'node:crypto';

export const generateAiIdentityKeyPair = (): {
    publicKey: string;
    privateKey: string;
    publicKeyFingerprint: string;
} => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const publicKeyBody = publicKey.replace(/-----[^-]+-----|\s/g, '');
    const fingerprint = createHash('sha256')
        .update(Buffer.from(publicKeyBody, 'base64'))
        .digest('base64');
    return {
        publicKey: publicKeyBody,
        privateKey,
        publicKeyFingerprint: `SHA256:${fingerprint}`,
    };
};

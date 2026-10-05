import { createHash, createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateAiIdentityKeyPair } from './aiIdentityKeys';

describe('generateAiIdentityKeyPair', () => {
    it('returns a Snowflake public key and its DER fingerprint', () => {
        const pair = generateAiIdentityKeyPair();
        const derived = createPublicKey(pair.privateKey).export({
            type: 'spki',
            format: 'der',
        });
        expect(pair.publicKey).toBe(derived.toString('base64'));
        expect(pair.publicKeyFingerprint).toBe(
            `SHA256:${createHash('sha256').update(derived).digest('base64')}`,
        );
    });
});

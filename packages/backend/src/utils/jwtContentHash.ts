import { createHash } from 'crypto';

// Hashes only the signed part of a JWT. The signature segment tolerates
// re-encoding, so a hash of the whole string is not a stable identity.
export const hashSignedJwtContent = (token: string): string => {
    const [header, payload] = token.split('.');
    return createHash('sha256').update(`${header}.${payload}`).digest('hex');
};

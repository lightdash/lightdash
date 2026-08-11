import bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export function deriveTokenHashSalt(secret: string): string {
    // Use the secret as key material to generate a consistent salt in valid
    // bcrypt format: $2b$10$ + 22 chars from the sha256 of the secret
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
    return `$2b$10$${secretHash.substring(0, 22)}`;
}

export async function hashWithSecret(
    s: string,
    secret: string,
): Promise<string> {
    return bcrypt.hash(s, deriveTokenHashSalt(secret));
}

export async function hash(s: string): Promise<string> {
    return hashWithSecret(s, process.env.LIGHTDASH_SECRET!);
}

/*
@deprecated use hash instead to hash new tokens
This is the old hash function that was used to hash the personal access tokens.
It was replaced with bcrypt to improve security
This is still used when filtering PAT from DB for backwards compatibility
*/
export function deprecatedHash(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

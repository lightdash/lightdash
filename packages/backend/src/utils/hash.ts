import bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export async function hash(s: string): Promise<string> {
    // Use LIGHTDASH_SECRET as key material to generate a consistent salt
    const secretHash = crypto
        .createHash('sha256')
        .update(process.env.LIGHTDASH_SECRET!)
        .digest('hex');
    // Create a valid bcrypt salt format: $2b$10$ + 22 chars from the hash
    const salt = `$2b$10$${secretHash.substring(0, 22)}`;
    return bcrypt.hash(s, salt);
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

import crypto, { KeyObject, X509Certificate } from 'crypto';
import fs from 'fs/promises';
import * as jose from 'jose';

/**
 * Loads and calculates the SHA-1 thumbprint for a x509 public key
 * certificate. For convenience, also generates a base64url representation
 * of the thumbprint for use with openid-client.
 *
 * This implementation may be overly Azure-specific, and require adjustment
 * later on.
 */
const calculatePublicKeyCertificateThumbprint = (
    pemEncodedCertificate: string,
) => {
    const certificate = new X509Certificate(pemEncodedCertificate);

    return {
        thumbprint: certificate.fingerprint,
        jwk: {
            kid: Buffer.from(
                certificate.fingerprint.replaceAll(':', ''),
                'hex',
            ).toString('base64url'),
        },
    };
};

/**
 * Exports the given pem-encoded private key as a JWK, optionally with
 * a given `kid` value.
 */
const exportJwkPrivateKey = async (pemEncodedKey: string, kid?: string) => {
    const keyObject = crypto.createPrivateKey(pemEncodedKey);
    const jwk = await jose.exportJWK(keyObject);

    return {
        ...jwk,
        kid,
    };
};

/**
 * Given a x509 public key certificate + private key pair, generates a JWT key set
 * for use with OIDC. This is intended for client assertion with `private_key_jwt`,
 * and may require adjusting for other purposes.
 */
export const buildJwtKeySet = async ({
    certificateFilePath,
    keyFilePath,
}: {
    certificateFilePath: string;
    keyFilePath: string;
}) => {
    const certificateFile = await fs.readFile(certificateFilePath, 'utf-8');
    const keyFile = await fs.readFile(keyFilePath, 'utf-8');

    const certificateThumbprint =
        calculatePublicKeyCertificateThumbprint(certificateFile);
    const jwk = await exportJwkPrivateKey(
        keyFile,
        certificateThumbprint.jwk.kid,
    );

    return [
        certificateThumbprint,
        jwk,
        {
            certificateFilePath,
            keyFilePath,
        },
    ] as const;
};

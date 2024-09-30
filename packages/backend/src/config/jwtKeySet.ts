import crypto, { X509Certificate } from 'crypto';
import fs from 'fs/promises';
import * as jose from 'jose';

interface JwtKeySet {
    certificateThumbprint: {
        thumbprint: string;
        jwk: {
            kid: string;
        };
    };

    jwk: jose.JWK;
}

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
): JwtKeySet['certificateThumbprint'] => {
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
const exportJwkPrivateKey = async (
    pemEncodedKey: string,
    kid?: string,
): Promise<JwtKeySet['jwk']> => {
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
 *
 * -- Azure specific:
 * Azure expects the key's identifier (kid) to be the same value as the
 * certificate SHA-1 thumbprint, base64-encoded, for purposes of key
 * matching.
 *
 * The Azure documentation is a bit inconsistent in this regard, but if
 * we override whatever the `kid` claim is at this point, openid-client
 * will know to include it as part of the jwt header.
 *
 * Azure claims reference:
 * https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
 */
export async function buildJwtKeySet(
    params: Partial<{
        certificateFile: string;
        keyFile: string;
        certificateFilePath: string;
        keyFilePath: string;
    }>,
): Promise<JwtKeySet> {
    const certificateFileContent = params.certificateFilePath
        ? await fs.readFile(params.certificateFilePath, 'utf-8')
        : params.certificateFile;
    const keyFileContent = params.keyFilePath
        ? await fs.readFile(params.keyFilePath, 'utf-8')
        : params.keyFile;

    if (!keyFileContent || !certificateFileContent) {
        throw new Error(
            'invariant: Must specify private key and x509 certificate path or contents as part of configuration',
        );
    }

    const certificateThumbprint = calculatePublicKeyCertificateThumbprint(
        certificateFileContent,
    );
    const jwk = await exportJwkPrivateKey(
        keyFileContent,
        certificateThumbprint.jwk.kid,
    );

    return {
        certificateThumbprint,
        jwk,
    };
}

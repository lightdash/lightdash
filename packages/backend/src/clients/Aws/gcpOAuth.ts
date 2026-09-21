import { type S3, type S3Client } from '@aws-sdk/client-s3';
import { HttpRequest } from '@smithy/protocol-http';
import { GoogleAuth, type AuthClient } from 'google-auth-library';

/** The OAuth scope that grants read and write access to Google Cloud Storage objects. */
const GCS_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';

/**
 * One authentication client per process. The client caches the access token
 * and contacts Google only when the token is close to expiry, so requesting a
 * token for every request costs almost nothing.
 */
let googleAuthClientPromise: Promise<AuthClient> | undefined;

export async function getGcpAccessToken(): Promise<string> {
    googleAuthClientPromise ??= new GoogleAuth({
        scopes: [GCS_SCOPE],
    }).getClient();
    const token = await (await googleAuthClientPromise).getAccessToken();
    const value = typeof token === 'string' ? token : token?.token;
    if (!value) {
        throw new Error('GoogleAuth returned no access token for GCS');
    }
    return value;
}

/**
 * Sends a Google OAuth bearer token instead of a SigV4 signature.
 *
 * Use this function together with the `gcp_oauth` branch of
 * `buildS3ClientConfig`, which stops the SDK from signing the request. The
 * middleware requests a token for every request rather than once per client,
 * so a multipart upload that runs for longer than the lifetime of the first
 * token keeps working.
 */
export function applyGcpOAuth(client: S3 | S3Client): void {
    client.middlewareStack.add(
        (next) => async (args) => {
            const { request } = args;
            if (!HttpRequest.isInstance(request)) return next(args);
            request.headers.authorization = `Bearer ${await getGcpAccessToken()}`;
            return next(args);
        },
        { step: 'finalizeRequest', name: 'gcpOAuthBearer', priority: 'low' },
    );
}

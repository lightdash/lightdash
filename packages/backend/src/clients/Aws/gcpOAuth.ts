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
 * The headers whose `x-amz-*` spelling carries meaning GCS can honor under a
 * bearer token once rewritten to `x-goog-*`: the copy source with its
 * conditional variants, the range header that UploadPartCopy sends, the
 * metadata directive, and user metadata. Every other `x-amz-*` header is
 * deleted rather than translated, because GCS locks a request into a header
 * dialect — S3 or GCS — based on the FIRST `x-amz-*` or `x-goog-*` header it
 * sees. The SDK puts `x-amz-user-agent` before everything else, so leaving it
 * in place makes GCS read the request as S3-dialect and reject the
 * translated `x-goog-*` headers with a bare `InvalidArgument`.
 */
const HEADERS_GCS_READS_UNDER_OAUTH =
    /^x-amz-(copy-source(-.+)?|metadata-directive|meta-.+)$/;

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
            Object.keys(request.headers).forEach((name) => {
                const lower = name.toLowerCase();
                if (!lower.startsWith('x-amz-')) return;
                const match = lower.match(HEADERS_GCS_READS_UNDER_OAUTH);
                if (match) {
                    request.headers[`x-goog-${match[1]}`] =
                        request.headers[name];
                }
                delete request.headers[name];
            });
            return next(args);
        },
        { step: 'finalizeRequest', name: 'gcpOAuthBearer', priority: 'low' },
    );
}

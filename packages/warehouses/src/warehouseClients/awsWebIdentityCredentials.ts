import { fromWebToken } from '@aws-sdk/credential-providers';
import { getErrorMessage, WarehouseConnectionError } from '@lightdash/common';

type AwsCredentialIdentityProvider = ReturnType<typeof fromWebToken>;

const GOOGLE_IDENTITY_TOKEN_URL =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const METADATA_TIMEOUT_MS = 5_000;
// AWS limits role session names to 64 characters.
const MAX_ROLE_SESSION_NAME_LENGTH = 64;

export type AwsWebIdentityOptions = {
    /** Server-derived audience, see getAwsWebIdentityAudience. */
    audience: string;
    /** Shown in the customer's CloudTrail as the assumed role session. */
    roleSessionName: string;
};

export const toRoleSessionName = (name: string) =>
    name.replace(/[^\w+=,.@-]/g, '-').slice(0, MAX_ROLE_SESSION_NAME_LENGTH);

/**
 * Fetches a Google-signed ID token for this server's workload identity. Its
 * `sub` is the service account's unique ID and its `aud` is `audience`.
 */
export const fetchGoogleIdentityToken = async (
    audience: string,
): Promise<string> => {
    const url = `${GOOGLE_IDENTITY_TOKEN_URL}?audience=${encodeURIComponent(
        audience,
    )}&format=full`;
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { 'Metadata-Flavor': 'Google' },
            signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
        });
    } catch (e) {
        throw new WarehouseConnectionError(
            `Could not get a Google identity token. Web identity authentication requires Lightdash to run on Google Cloud with workload identity. ${getErrorMessage(
                e,
            )}`,
        );
    }
    if (!response.ok) {
        throw new WarehouseConnectionError(
            `Could not get a Google identity token: the metadata server returned ${response.status}.`,
        );
    }
    return response.text();
};

/**
 * Exchanges this server's Google identity for temporary credentials on
 * `roleArn` with sts:AssumeRoleWithWebIdentity. The AWS SDK caches the result
 * and calls the provider again when the credentials are about to expire.
 */
export const awsWebIdentityCredentialProvider = ({
    roleArn,
    region,
    webIdentity,
}: {
    roleArn: string | undefined;
    region: string;
    webIdentity: AwsWebIdentityOptions | undefined;
}): AwsCredentialIdentityProvider => {
    // Fail when credentials are first needed rather than at construction, so
    // a client used only for SQL generation still works.
    if (!webIdentity) {
        return async () => {
            throw new WarehouseConnectionError(
                'Web identity authentication is not enabled on this Lightdash instance.',
            );
        };
    }
    if (!roleArn) {
        return async () => {
            throw new WarehouseConnectionError(
                'Web identity authentication requires an IAM role ARN.',
            );
        };
    }
    return async () => {
        const webIdentityToken = await fetchGoogleIdentityToken(
            webIdentity.audience,
        );
        try {
            return await fromWebToken({
                roleArn,
                webIdentityToken,
                roleSessionName: toRoleSessionName(webIdentity.roleSessionName),
                clientConfig: { region },
            })();
        } catch (e) {
            const name = e instanceof Error ? e.name : undefined;
            if (name === 'AccessDenied' || name === 'AccessDeniedException') {
                throw new WarehouseConnectionError(
                    `AWS denied assuming ${roleArn}. Check that the role's trust policy allows accounts.google.com with this Lightdash instance's subject and the audience "${webIdentity.audience}".`,
                );
            }
            throw new WarehouseConnectionError(
                `Could not assume ${roleArn} with web identity. ${getErrorMessage(
                    e,
                )}`,
            );
        }
    };
};

import { getErrorMessage, WarehouseConnectionError } from '@lightdash/common';
import { z } from 'zod';
import Logger from '../../logging/logger';

export const GOOGLE_IDENTITY_TOKEN_UNAVAILABLE =
    "The server couldn't get its Google identity token. Try again, or contact support.";

/** Issues Google-signed ID tokens for this Lightdash instance's identity. */
export interface GoogleIdentityTokenSource {
    getIdToken(audience: string): Promise<string>;
}

const GCP_METADATA_IDENTITY_URL =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const METADATA_TIMEOUT_MS = 5_000;

/** Builds the fixed metadata identity request shared by Node and dbt credentials. */
export const getGcpMetadataIdentityRequest = (audience: string) => ({
    url: `${GCP_METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`,
    headers: { 'Metadata-Flavor': 'Google' },
});

/** Tokens for the GKE workload identity, from the metadata server. */
export class GcpMetadataIdentityTokenSource implements GoogleIdentityTokenSource {
    async getIdToken(audience: string): Promise<string> {
        const { url, headers } = getGcpMetadataIdentityRequest(audience);
        let response: Response;
        try {
            response = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
            });
        } catch (e) {
            Logger.warn(
                `Could not reach the GCP metadata server for an identity token: ${getErrorMessage(e)}`,
            );
            throw new WarehouseConnectionError(
                GOOGLE_IDENTITY_TOKEN_UNAVAILABLE,
            );
        }
        if (!response.ok) {
            Logger.warn(
                `The GCP metadata server returned ${response.status} for an identity token`,
            );
            throw new WarehouseConnectionError(
                GOOGLE_IDENTITY_TOKEN_UNAVAILABLE,
            );
        }
        return response.text();
    }
}

export const defaultGoogleIdentityTokenSource =
    new GcpMetadataIdentityTokenSource();

const idTokenClaims = z.object({
    sub: z.string().optional(),
    exp: z.number().finite().optional(),
});

const getIdTokenClaims = (token: string) => {
    try {
        return idTokenClaims.parse(
            JSON.parse(
                Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
            ),
        );
    } catch {
        return undefined;
    }
};

/** Reads the `sub` claim of a Google ID token without verifying it. */
export const getIdTokenSubject = (token: string): string | undefined =>
    getIdTokenClaims(token)?.sub;

/** Reads expiry for caching; the token exchange verifies the token. */
export const getIdTokenExpiry = (token: string): number | undefined =>
    getIdTokenClaims(token)?.exp;

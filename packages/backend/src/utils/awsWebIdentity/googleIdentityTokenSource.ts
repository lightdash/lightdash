import { getErrorMessage, WarehouseConnectionError } from '@lightdash/common';
import Logger from '../../logging/logger';
import { AWS_WEB_IDENTITY_MESSAGES } from './messages';

/** Issues Google-signed ID tokens for this Lightdash instance's identity. */
export interface GoogleIdentityTokenSource {
    getIdToken(audience: string): Promise<string>;
}

const GCP_METADATA_IDENTITY_URL =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const METADATA_TIMEOUT_MS = 5_000;

/** Tokens for the GKE workload identity, from the metadata server. */
export class GcpMetadataIdentityTokenSource implements GoogleIdentityTokenSource {
    async getIdToken(audience: string): Promise<string> {
        const url = `${GCP_METADATA_IDENTITY_URL}?audience=${encodeURIComponent(
            audience,
        )}&format=full`;
        let response: Response;
        try {
            response = await fetch(url, {
                headers: { 'Metadata-Flavor': 'Google' },
                signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
            });
        } catch (e) {
            Logger.warn(
                `Could not reach the GCP metadata server for an identity token: ${getErrorMessage(e)}`,
            );
            throw new WarehouseConnectionError(
                AWS_WEB_IDENTITY_MESSAGES.tokenUnavailable,
            );
        }
        if (!response.ok) {
            Logger.warn(
                `The GCP metadata server returned ${response.status} for an identity token`,
            );
            throw new WarehouseConnectionError(
                AWS_WEB_IDENTITY_MESSAGES.tokenUnavailable,
            );
        }
        return response.text();
    }
}

export const defaultGoogleIdentityTokenSource =
    new GcpMetadataIdentityTokenSource();

/** Reads the `sub` claim of a Google ID token without verifying it. */
export const getIdTokenSubject = (token: string): string | undefined => {
    try {
        const payload = JSON.parse(
            Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
        );
        return typeof payload.sub === 'string' ? payload.sub : undefined;
    } catch {
        return undefined;
    }
};

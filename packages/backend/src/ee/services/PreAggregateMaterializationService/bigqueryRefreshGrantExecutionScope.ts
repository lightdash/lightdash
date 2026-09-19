import { createHmac } from 'crypto';
import { hashPreAggregateCompatibility } from './preAggregatePreparation';
import { type UnverifiedExecutionScope } from './unverifiedExecutionScope';

/** Public GoogleAuth APIs, shared by the SDK versions used by backend and
 * warehouses. jsonContent is populated from the ADC source by getClient(). */
type BigquerySdkAuthClient = {
    jsonContent: unknown;
    getClient: () => Promise<unknown>;
};

const TRANSIENT_TOKEN_FIELDS = new Set([
    'access_token',
    'token',
    'expiry_date',
    'expires_in',
]);

/** Execution-only proof from the actual SDK's ADC refresh grant. This never
 * identifies a named principal and must not enable cross-publication reuse.
 * Pass the same actual execution client's authClient again before submission.
 * Project keyfileContents is deliberately not an input: ADC ignores it. */
export const deriveBigqueryRefreshGrantExecutionScope = async ({
    authClient,
    actorId,
    credentialSourceId,
    secret,
}: {
    authClient: BigquerySdkAuthClient;
    actorId: string;
    credentialSourceId: string;
    secret: string;
}): Promise<UnverifiedExecutionScope> => {
    if (!actorId || !credentialSourceId || !secret) {
        return { status: 'unavailable' };
    }

    try {
        // GoogleAuth._cacheClientFromJSON stores both its instantiated client
        // and the exact loaded JSON in these public APIs. Resolve first because
        // ADC may come from a file discovered only when getClient() is called.
        await authClient.getClient();
        const source = authClient.jsonContent;
        if (
            source === null ||
            typeof source !== 'object' ||
            !('type' in source) ||
            (source.type !== 'authorized_user' &&
                source.type !== 'external_account_authorized_user') ||
            !('client_id' in source) ||
            typeof source.client_id !== 'string' ||
            !source.client_id ||
            !('client_secret' in source) ||
            typeof source.client_secret !== 'string' ||
            !source.client_secret ||
            !('refresh_token' in source) ||
            typeof source.refresh_token !== 'string' ||
            !source.refresh_token
        ) {
            // An external_account audience or credential-source URL can serve
            // different subjects. That configuration alone is not identity
            // proof; direct federation needs a separately verified principal.
            return { status: 'unavailable' };
        }

        // The grant fixes the principal while the SDK rotates access tokens.
        // Internally rotated refresh tokens retain this originating grant;
        // replacing the configured grant changes this proof conservatively.
        const refreshGrant = Object.fromEntries(
            Object.entries(source).filter(
                ([key]) => !TRANSIENT_TOKEN_FIELDS.has(key),
            ),
        );
        const sourceHash = hashPreAggregateCompatibility({
            domain: 'lightdash.preaggregate.bigquery-refresh-grant.v1',
            actorId,
            credentialSourceId,
            refreshGrant,
        });
        return {
            status: 'proven',
            hash: createHmac('sha256', secret).update(sourceHash).digest('hex'),
        };
    } catch {
        // SDK errors may include credential source contents. Return only lack
        // of proof, never the error or its raw credentials.
        return { status: 'unavailable' };
    }
};

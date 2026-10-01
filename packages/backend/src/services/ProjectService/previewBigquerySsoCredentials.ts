import {
    assertUnreachable,
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { UserRefreshClient } from 'google-auth-library';
import NodeCache from 'node-cache';
import { createHash } from 'node:crypto';

type BigquerySsoCredentials = {
    credentials: CreateBigqueryCredentials;
    clientId: string;
    refreshToken: string;
};

export type GoogleRefreshTokenStatus = 'valid' | 'rejected' | 'unknown';

export type CheckGoogleRefreshToken = (
    keyfileContents: CreateBigqueryCredentials['keyfileContents'],
) => Promise<GoogleRefreshTokenStatus>;

export type StalePreviewRepair =
    | { kind: 'unchanged' }
    | {
          kind: 'repaired';
          credentials: CreateBigqueryCredentials;
          staleRefreshToken: string;
      }
    | { kind: 'expired' };

export const getBigquerySsoCredentials = (
    credentials: CreateWarehouseCredentials,
): BigquerySsoCredentials | null => {
    if (
        credentials.type !== WarehouseTypes.BIGQUERY ||
        credentials.authenticationType !== BigqueryAuthenticationType.SSO
    ) {
        return null;
    }
    const keyfile = credentials.keyfileContents;
    if (
        keyfile?.type !== 'authorized_user' ||
        !keyfile.client_id ||
        !keyfile.refresh_token
    ) {
        return null;
    }
    return {
        credentials,
        clientId: keyfile.client_id,
        refreshToken: keyfile.refresh_token,
    };
};

const withKeyfile = (
    credentials: CreateBigqueryCredentials,
    keyfileContents: CreateBigqueryCredentials['keyfileContents'],
): CreateBigqueryCredentials => ({ ...credentials, keyfileContents });

export const getPushedPreviewCredentials = ({
    previewCredentials,
    previousUpstreamCredentials,
    nextUpstreamCredentials,
}: {
    previewCredentials: CreateWarehouseCredentials;
    previousUpstreamCredentials: CreateWarehouseCredentials;
    nextUpstreamCredentials: CreateWarehouseCredentials;
}): CreateBigqueryCredentials | null => {
    const preview = getBigquerySsoCredentials(previewCredentials);
    const previous = getBigquerySsoCredentials(previousUpstreamCredentials);
    const next = getBigquerySsoCredentials(nextUpstreamCredentials);
    if (!preview || !previous || !next) return null;
    if (
        preview.clientId !== previous.clientId ||
        preview.refreshToken !== previous.refreshToken ||
        preview.refreshToken === next.refreshToken
    ) {
        return null;
    }
    return withKeyfile(preview.credentials, next.credentials.keyfileContents);
};

export const getPreviewOwnsBigquerySsoCredentials = ({
    previewCredentials,
    upstreamCredentials,
}: {
    previewCredentials: CreateWarehouseCredentials;
    upstreamCredentials: CreateWarehouseCredentials;
}): boolean | null => {
    const preview = getBigquerySsoCredentials(previewCredentials);
    if (!preview) return null;
    const upstream = getBigquerySsoCredentials(upstreamCredentials);
    return (
        upstream === null ||
        preview.clientId !== upstream.clientId ||
        preview.refreshToken !== upstream.refreshToken
    );
};

export const repairStalePreviewBigquerySso = async ({
    previewCredentials,
    upstreamCredentials,
    checkRefreshToken,
}: {
    previewCredentials: CreateWarehouseCredentials;
    upstreamCredentials: CreateWarehouseCredentials;
    checkRefreshToken: CheckGoogleRefreshToken;
}): Promise<StalePreviewRepair> => {
    const preview = getBigquerySsoCredentials(previewCredentials);
    const upstream = getBigquerySsoCredentials(upstreamCredentials);
    if (!preview || !upstream || preview.clientId !== upstream.clientId) {
        return { kind: 'unchanged' };
    }
    const previewStatus = await checkRefreshToken(
        preview.credentials.keyfileContents,
    );
    if (previewStatus !== 'rejected') return { kind: 'unchanged' };
    if (preview.refreshToken === upstream.refreshToken) {
        return { kind: 'expired' };
    }

    const upstreamStatus = await checkRefreshToken(
        upstream.credentials.keyfileContents,
    );
    switch (upstreamStatus) {
        case 'valid':
            return {
                kind: 'repaired',
                credentials: withKeyfile(
                    preview.credentials,
                    upstream.credentials.keyfileContents,
                ),
                staleRefreshToken: preview.refreshToken,
            };
        case 'rejected':
            return { kind: 'expired' };
        case 'unknown':
            return { kind: 'unchanged' };
        default:
            return assertUnreachable(upstreamStatus, 'Unknown token status');
    }
};

const isInvalidGrant = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return false;
    const { response } = error as {
        response?: { status?: number; data?: { error?: unknown } };
    };
    return response?.status === 400 && response.data?.error === 'invalid_grant';
};

export const checkGoogleRefreshToken: CheckGoogleRefreshToken = async (
    keyfileContents,
) => {
    const client = new UserRefreshClient({
        clientId: keyfileContents.client_id,
        clientSecret: keyfileContents.client_secret,
        refreshToken: keyfileContents.refresh_token,
    });
    try {
        await client.getAccessToken();
        return 'valid';
    } catch (error) {
        return isInvalidGrant(error) ? 'rejected' : 'unknown';
    }
};

const validRefreshTokens = new NodeCache({ stdTTL: 60, checkperiod: 30 });

export const checkGoogleRefreshTokenCached: CheckGoogleRefreshToken = async (
    keyfileContents,
) => {
    const key = createHash('sha256')
        .update(keyfileContents.refresh_token ?? '')
        .digest('hex');
    if (validRefreshTokens.get(key)) return 'valid';
    const status = await checkGoogleRefreshToken(keyfileContents);
    if (status === 'valid') validRefreshTokens.set(key, true);
    return status;
};

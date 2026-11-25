import {
    Account,
    ForbiddenError,
    isAccount,
    SessionUser,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { scopesForOAuthRecord } from './mode';
import { getOAuthScopeContext } from './scopedAbility';

export const OAUTH_CREDENTIAL_OPERATIONS = {
    enqueueLearnSandboxCommand: ['create', 'LearnSandboxCredential'],
    createPersonalAccessToken: ['create', 'PersonalAccessToken'],
    rotatePersonalAccessToken: ['rotate', 'PersonalAccessToken'],
    createServiceAccount: ['create', 'ServiceAccount'],
    rotateServiceAccount: ['rotate', 'ServiceAccount'],
    createScimToken: ['create', 'ScimToken'],
    rotateScimToken: ['rotate', 'ScimToken'],
    createOAuthClient: ['create', 'OAuthClient'],
    updateOAuthClient: ['update', 'OAuthClient'],
    deleteOAuthClient: ['delete', 'OAuthClient'],
} as const;

const clientIdForLog = (clientId: string | null): string | null => {
    if (clientId === null) return null;
    try {
        const url = new URL(clientId);
        return `${url.origin}${url.pathname}`;
    } catch {
        return clientId.slice(0, 128);
    }
};

const cliVersionFromUserAgent = (
    userAgent: string | undefined,
): string | null =>
    /^lightdash-cli\/(\d+\.\d+\.\d+[\w.-]{0,32})(?:\s|$)/.exec(
        userAgent ?? '',
    )?.[1] ?? null;

export const assertOAuthCredentialOperationAllowed = (
    actor: Account | SessionUser,
    operation: keyof typeof OAUTH_CREDENTIAL_OPERATIONS,
): void => {
    const context = getOAuthScopeContext(
        isAccount(actor) ? actor.user.ability : actor.ability,
    );
    const oauth =
        isAccount(actor) && actor.authentication.type === 'oauth'
            ? actor.authentication
            : null;
    if (context === null && oauth === null) return;
    Logger.warn('oauth_credential_mint_refused', {
        operation,
        clientId: clientIdForLog(oauth?.clientId ?? context?.clientId ?? null),
        scopes: scopesForOAuthRecord(oauth?.scopes ?? context?.scopes ?? []),
        cliVersion: cliVersionFromUserAgent(actor.requestContext?.userAgent),
    });
    throw new ForbiddenError('OAuth tokens cannot manage credentials');
};

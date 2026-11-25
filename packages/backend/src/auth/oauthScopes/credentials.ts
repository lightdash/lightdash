import {
    Account,
    ForbiddenError,
    isAccount,
    SessionUser,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { clientIdForOAuthRecord, scopesForOAuthRecord } from './mode';
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
        clientId: clientIdForOAuthRecord(
            oauth?.clientId ?? context?.clientId ?? null,
        ),
        scopes: scopesForOAuthRecord(oauth?.scopes ?? context?.scopes ?? []),
        userUuid: isAccount(actor) ? actor.user.id : actor.userUuid,
        organizationUuid:
            (isAccount(actor)
                ? actor.organization.organizationUuid
                : actor.organizationUuid) ?? null,
        cliVersion: cliVersionFromUserAgent(actor.requestContext?.userAgent),
    });
    throw new ForbiddenError('OAuth tokens cannot manage credentials');
};

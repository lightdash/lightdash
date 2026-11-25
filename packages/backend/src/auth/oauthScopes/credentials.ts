import {
    Account,
    ForbiddenError,
    isAccount,
    SessionUser,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { DEFAULT_OAUTH_CLIENT_ID } from '../../models/OAuth2Model';
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

// CLI releases before 3.88.0 create a personal access token with their
// browser-login OAuth token. This keeps that working for a limited time.
// Remove the exception and this constant after this date.
export const CLI_OAUTH_PAT_COMPAT_UNTIL = new Date('2027-03-15T00:00:00Z');

export const CLI_OAUTH_PAT_COMPAT_MAX_HOURS = 8;

export const isCliOAuthPatCompatCandidate = (
    account: Account,
    now: Date = new Date(),
): boolean => {
    const { authentication } = account;
    return (
        authentication.type === 'oauth' &&
        authentication.clientId === DEFAULT_OAUTH_CLIENT_ID &&
        authentication.scopes.includes('write') &&
        authentication.agentConnectionGrant == null &&
        now.getTime() < CLI_OAUTH_PAT_COMPAT_UNTIL.getTime()
    );
};

export const logCliOAuthPatCompatUsed = (
    account: Account,
    expiresAt: Date,
): void => {
    Logger.warn('oauth_cli_pat_compat_used', {
        clientId:
            account.authentication.type === 'oauth'
                ? clientIdForOAuthRecord(account.authentication.clientId)
                : null,
        userUuid: account.user.id,
        organizationUuid: account.organization.organizationUuid ?? null,
        expiresAt: expiresAt.toISOString(),
        cliVersion: cliVersionFromUserAgent(account.requestContext?.userAgent),
    });
};

type OAuthCredentialOperation = keyof typeof OAUTH_CREDENTIAL_OPERATIONS;

const isCliOAuthPatActor = (actor: Account | SessionUser): boolean =>
    isAccount(actor)
        ? actor.authentication.type === 'pat' &&
          actor.authentication.cliOAuthPatCompat === true
        : actor.personalAccessToken?.cliOAuthPatCompat === true;

const refuseCliOAuthPat = (
    actor: Account | SessionUser,
    operation: OAuthCredentialOperation,
    markedToken: 'actor' | 'target',
    message: string,
): never => {
    Logger.warn('oauth_cli_pat_credential_refused', {
        operation,
        markedToken,
        userUuid: isAccount(actor) ? actor.user.id : actor.userUuid,
        organizationUuid:
            (isAccount(actor)
                ? actor.organization.organizationUuid
                : actor.organizationUuid) ?? null,
        cliVersion: cliVersionFromUserAgent(actor.requestContext?.userAgent),
    });
    throw new ForbiddenError(message);
};

export const assertPersonalAccessTokenRotationAllowed = (
    actor: Account | SessionUser,
    token: { cliOAuthPatCompat: boolean },
): void => {
    if (token.cliOAuthPatCompat !== true) return;
    refuseCliOAuthPat(
        actor,
        'rotatePersonalAccessToken',
        'target',
        'Personal access tokens created by CLI browser login cannot be rotated',
    );
};

export const assertOAuthCredentialOperationAllowed = (
    actor: Account | SessionUser,
    operation: OAuthCredentialOperation,
): void => {
    if (isCliOAuthPatActor(actor))
        refuseCliOAuthPat(
            actor,
            operation,
            'actor',
            'Personal access tokens created by CLI browser login cannot manage credentials',
        );
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

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
    startOnboardingRun: ['create', 'OnboardingRunCredential'],
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

export const assertOAuthCredentialOperationAllowed = (
    actor: Account | SessionUser,
    operation: keyof typeof OAUTH_CREDENTIAL_OPERATIONS,
): void => {
    const context = getOAuthScopeContext(
        isAccount(actor) ? actor.user.ability : actor.ability,
    );
    if (
        context === null &&
        !(isAccount(actor) && actor.authentication.type === 'oauth')
    )
        return;
    const authentication = isAccount(actor) ? actor.authentication : null;
    const oauth = authentication?.type === 'oauth' ? authentication : null;
    Logger.warn('oauth_credential_mint_refused', {
        operation,
        clientId: oauth?.clientId ?? context?.clientId ?? null,
        scopes: scopesForOAuthRecord(oauth?.scopes ?? context?.scopes ?? []),
        userAgent: actor.requestContext?.userAgent ?? null,
        cliVersion: actor.requestContext?.cliVersion ?? null,
        organizationUuid: isAccount(actor)
            ? (actor.organization.organizationUuid ?? null)
            : (actor.organizationUuid ?? null),
    });
    throw new ForbiddenError('OAuth tokens cannot manage credentials');
};

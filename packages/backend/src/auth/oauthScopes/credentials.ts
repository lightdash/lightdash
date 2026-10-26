import {
    Account,
    ForbiddenError,
    isAccount,
    SessionUser,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { scopesForOAuthRecord } from './mode';
import { getOAuthScopeContext, recordOAuthRefusalOnce } from './scopedAbility';

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

export const OAUTH_CREDENTIAL_ROUTE_OPERATIONS = {
    'OnboardingAgentController.createRun': 'startOnboardingRun',
    'LearnSandboxController.runCommand': 'enqueueLearnSandboxCommand',
    'UserController.createPersonalAccessToken': 'createPersonalAccessToken',
    'UserController.rotatePersonalAccessToken': 'rotatePersonalAccessToken',
    'ServiceAccountsController.createServiceAccount': 'createServiceAccount',
    'ServiceAccountsController.rotateServiceAccount': 'rotateServiceAccount',
    'ScimOrganizationAccessTokenController.createOrganizationAccessToken':
        'createScimToken',
    'ScimOrganizationAccessTokenController.rotateOrganizationAccessToken':
        'rotateScimToken',
    'oauthRouter POST /clients': 'createOAuthClient',
    'oauthRouter PATCH /clients/:clientId': 'updateOAuthClient',
    'oauthRouter DELETE /clients/:clientId': 'deleteOAuthClient',
} as const satisfies Record<string, keyof typeof OAUTH_CREDENTIAL_OPERATIONS>;

const clientIdForLog = (clientId: string | null): string | null => {
    if (clientId === null) return null;
    try {
        const url = new URL(clientId);
        return `${url.origin}${url.pathname}`;
    } catch {
        return clientId.slice(0, 128);
    }
};

export const assertOAuthCredentialOperationAllowed = (
    actor: Account | SessionUser,
    operation: keyof typeof OAUTH_CREDENTIAL_OPERATIONS,
): void => {
    const ability = isAccount(actor) ? actor.user.ability : actor.ability;
    const context = getOAuthScopeContext(ability);
    if (
        context === null &&
        !(isAccount(actor) && actor.authentication.type === 'oauth')
    )
        return;
    const authentication = isAccount(actor) ? actor.authentication : null;
    const oauth = authentication?.type === 'oauth' ? authentication : null;
    const record = () => {
        Logger.warn('oauth_credential_mint_refused', {
            operation,
            clientId: clientIdForLog(
                oauth?.clientId ?? context?.clientId ?? null,
            ),
            scopes: scopesForOAuthRecord(
                oauth?.scopes ?? context?.scopes ?? [],
            ),
            userAgent: actor.requestContext?.userAgent ?? null,
            cliVersion: actor.requestContext?.cliVersion ?? null,
            organizationUuid: isAccount(actor)
                ? (actor.organization.organizationUuid ?? null)
                : (actor.organizationUuid ?? null),
        });
    };
    recordOAuthRefusalOnce(
        ability,
        ['oauth_credential_mint_refused', operation],
        record,
    );
    throw new ForbiddenError('OAuth tokens cannot manage credentials');
};

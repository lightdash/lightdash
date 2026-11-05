import {
    Account,
    ForbiddenError,
    isAccount,
    SessionUser,
} from '@lightdash/common';
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
    if (isAccount(actor) && actor.authentication.type !== 'oauth') return;
    const context = getOAuthScopeContext(
        isAccount(actor) ? actor.user.ability : actor.ability,
    );
    if (context === null) return;
    const [action, subjectType] = OAUTH_CREDENTIAL_OPERATIONS[operation];
    context.record(action, subjectType, null);
    throw new ForbiddenError('OAuth tokens cannot manage credentials');
};

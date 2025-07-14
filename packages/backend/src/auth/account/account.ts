/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// This rule is failing in CI but passes locally
import { Ability, AbilityBuilder } from '@casl/ability';
import {
    Account,
    AccountHelpers,
    AccountOrganization,
    AnonymousAccount,
    applyEmbeddedAbility,
    CreateEmbedJwt,
    Embed,
    ForbiddenError,
    MemberAbility,
    Organization,
    SessionAccount,
    SessionUser,
    UserAccessControls,
} from '@lightdash/common';

const getExternalId = (
    decodedToken: CreateEmbedJwt,
    embedToken: string,
    organization: Pick<Organization, 'organizationUuid' | 'name'>,
): string =>
    decodedToken.user?.externalId ||
    `anonymous-jwt::${organization.organizationUuid}_${embedToken}`;

type WithoutHelpers<T extends Account> = Omit<T, keyof AccountHelpers>;

/**
 * Creates a SessionAccount with helper methods
 */
function createAccount(account: WithoutHelpers<SessionAccount>): SessionAccount;
/**
 * Creates an AnonymousAccount with helper methods
 */
function createAccount(
    account: WithoutHelpers<AnonymousAccount>,
): AnonymousAccount;
/**
 * Creates an account with helper methods based on the input type
 */
function createAccount(
    account: WithoutHelpers<SessionAccount | AnonymousAccount>,
): SessionAccount | AnonymousAccount {
    if (!account.user?.ability || !account.user?.abilityRules) {
        throw new ForbiddenError(
            'User ability and abilityRules are required for permissions',
        );
    }

    return {
        ...account,
        isAuthenticated: () => !!account.authentication && !!account.user?.id,
        isRegisteredUser: () => account.user?.type === 'registered',
        isAnonymousUser: () => account.user?.type === 'anonymous',
        isSessionUser: () => account.authentication?.type === 'session',
        isJwtUser: () => account.authentication?.type === 'jwt',
    } as SessionAccount | AnonymousAccount;
}

export const fromJwt = ({
    decodedToken,
    organization,
    source,
    dashboardUuid,
    userAttributes,
}: {
    decodedToken: CreateEmbedJwt;
    organization: Embed['organization'];
    source: string;
    dashboardUuid: string;
    userAttributes: UserAccessControls;
}): AnonymousAccount => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyEmbeddedAbility(decodedToken, dashboardUuid, organization, builder);
    const abilities = builder.build();

    return createAccount({
        authentication: {
            type: 'jwt',
            data: decodedToken,
            source,
        },
        organization,
        access: {
            dashboardId: dashboardUuid,
            filtering: decodedToken.content.dashboardFiltersInteractivity,
            controls: userAttributes,
        },
        // Create the fields we're able to set from the JWT
        user: {
            id: getExternalId(decodedToken, source, organization),
            type: 'anonymous',
            ability: abilities,
            abilityRules: abilities.rules,
            email: decodedToken.user?.email,
            isActive: true,
        },
    });
};

export const fromSession = (
    sessionUser: SessionUser,
    source: string = '',
): SessionAccount => {
    const {
        organizationCreatedAt,
        organizationName,
        organizationUuid,
        ...user
    } = sessionUser;

    const organization: AccountOrganization = {
        organizationUuid,
        name: organizationName,
    };

    return createAccount({
        authentication: {
            type: 'session',
            source,
        },
        organization,
        user: {
            ...user,
            type: 'registered',
            id: user.userUuid,
        },
    });
};

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// This rule is failing in CI but passes locally
import { Ability, AbilityBuilder } from '@casl/ability';
import {
    Account,
    AccountOrganization,
    AccountWithoutHelpers,
    AnonymousAccount,
    ApiKeyAccount,
    applyEmbeddedAbility,
    buildAccountHelpers,
    CreateEmbedJwt,
    EmbedContent,
    ForbiddenError,
    MemberAbility,
    OauthAccount,
    Organization,
    OssEmbed,
    ServiceAcctAccount,
    SessionAccount,
    SessionUser,
    UserAccessControls,
} from '@lightdash/common';

/**
 * Creates an ID for the external user. We prefix the ID to prevent hijacking a real user ID.
 * For the default ID, we limit the length to under 255 characters as that's the varchar limit for Postgres.
 */
const getExternalId = (
    decodedToken: CreateEmbedJwt,
    embedToken: string,
    organization: Pick<Organization, 'organizationUuid' | 'name'>,
): string => {
    const defaultBase = `${organization.organizationUuid}_${embedToken}`;
    const baseId = decodedToken.user?.externalId || defaultBase;
    return `external::${baseId}`.slice(0, 254);
};

const createAccount = <T extends Account>(
    account: AccountWithoutHelpers<T>,
): T => {
    if (!account.user?.ability || !account.user?.abilityRules) {
        throw new ForbiddenError(
            'User ability and abilityRules are required for permissions',
        );
    }

    return {
        ...account,
        ...buildAccountHelpers(account),
    } as T;
};

/**
 * Shared helper function to extract organization data and user data from SessionUser
 */
const extractOrganizationFromUser = (
    sessionUser: SessionUser,
): [AccountOrganization, SessionUser] => {
    const {
        organizationCreatedAt,
        organizationName,
        organizationUuid,
        ...user
    } = sessionUser;
    return [
        {
            organizationUuid,
            name: organizationName,
            createdAt: organizationCreatedAt,
        },
        user,
    ];
};

export const fromJwt = ({
    decodedToken,
    embed,
    source,
    userAttributes,
    content,
}: {
    decodedToken: CreateEmbedJwt;
    embed: OssEmbed;
    source: string;
    userAttributes: UserAccessControls;
    content: EmbedContent;
}): AnonymousAccount => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    const externalId = getExternalId(decodedToken, source, embed.organization);

    applyEmbeddedAbility(decodedToken, content, embed, externalId, builder);
    const abilities = builder.build();

    return createAccount({
        authentication: {
            type: 'jwt',
            data: decodedToken,
            source,
        },
        organization: embed.organization,
        embed,
        access: {
            content,
            filtering: decodedToken.content.dashboardFiltersInteractivity,
            parameters: decodedToken.content.parameterInteractivity,
            controls: userAttributes,
        },
        // Create the fields we're able to set from the JWT
        user: {
            id: externalId,
            type: 'anonymous',
            ability: abilities,
            abilityRules: abilities.rules,
            email: decodedToken.user?.email,
            isActive: true,
        },
    });
};

// TODO: This uses the hacky method of copying over an admin user. Long-term, we'll want to have a proper
// service-account/principle-user unrelated to a real admin-user.
// @see https://github.com/lightdash/lightdash/issues/15466
export const fromServiceAccount = (
    sessionUser: SessionUser,
    source: string,
): ServiceAcctAccount => {
    const [organization, user] = extractOrganizationFromUser(sessionUser);

    return createAccount({
        authentication: {
            type: 'service-account',
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

export const fromApiKey = (
    sessionUser: SessionUser,
    source: string,
): ApiKeyAccount => {
    const [organization, user] = extractOrganizationFromUser(sessionUser);

    return createAccount({
        authentication: {
            type: 'pat',
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

export const fromSession = (
    sessionUser: SessionUser,
    source: string = '',
): SessionAccount => {
    const [organization, user] = extractOrganizationFromUser(sessionUser);

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

export const fromOauth = (
    sessionUser: SessionUser,
    token: {
        accessToken: string;
        accessTokenExpiresAt?: Date;
        refreshToken?: string;
        refreshTokenExpiresAt?: Date;
        scope?: string[];
        client: { id: string };
    },
): OauthAccount => {
    const [organization, user] = extractOrganizationFromUser(sessionUser);
    return createAccount({
        authentication: {
            type: 'oauth',
            source: token.accessToken,
            token: token.accessToken,
            clientId: token.client.id,
            scopes: token.scope || [],
        },
        organization,
        user: {
            ...user,
            type: 'registered',
            id: user.userUuid,
        },
    });
};

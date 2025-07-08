/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { Ability, AbilityBuilder } from '@casl/ability';
import {
    applyEmbeddedAbility,
    CreateEmbedJwt,
    Embed,
    ExternalAccount,
    MemberAbility,
    Organization,
} from '@lightdash/common';

function getExternalId(
    decodedToken: CreateEmbedJwt,
    embedToken: string,
    organization: Pick<Organization, 'organizationUuid' | 'name'>,
): string {
    return (
        decodedToken.user?.externalId ||
        `anonymous-jwt::${organization.organizationUuid}_${embedToken}`
    );
}

/**
 * Builds CASL abilities for the embedded user based on JWT content
 */
function buildEmbedAbilities(
    embedJwt: CreateEmbedJwt,
    dashboardUuid: string,
    organization: Embed['organization'],
): MemberAbility {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyEmbeddedAbility(embedJwt, dashboardUuid, organization, builder);

    return builder.build();
}

export function hydrateEmbeddedAccount(
    organization: Embed['organization'],
    embedJwt: CreateEmbedJwt,
    rawToken: string,
    dashboardUuid: string,
): ExternalAccount {
    const abilities: MemberAbility = buildEmbedAbilities(
        embedJwt,
        dashboardUuid,
        organization,
    );

    return {
        authentication: {
            type: 'jwt',
            data: embedJwt,
            source: rawToken,
        },
        organization,
        // Create the fields we're able to set from the JWT
        user: {
            id: getExternalId(embedJwt, rawToken, organization),
            type: 'external',
            ability: abilities,
            abilityRules: abilities.rules,
            email: embedJwt.user?.email,
            isActive: true,
        },
    };
}

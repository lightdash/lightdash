import { Ability, AbilityBuilder } from '@casl/ability';
import {
    Account,
    CreateEmbedJwt,
    EmbedJwt,
    isDashboardUuidContent,
    MemberAbility,
    Organization,
    OrganizationMemberRole,
} from '@lightdash/common';
import { applyEmbeddedAbility } from '@lightdash/common/src/authorization/scopeAbility';

function getExternalId(decodedToken: CreateEmbedJwt, embedToken: string) {
    return (
        decodedToken.user?.externalId ||
        decodedToken.iat?.toString() ||
        embedToken
    );
}

/**
 * Builds CASL abilities for the embedded user based on JWT content
 */
function buildEmbedAbilities(
    embedJwt: CreateEmbedJwt,
    dashboardUuid: string,
): MemberAbility {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyEmbeddedAbility(embedJwt, dashboardUuid, builder);

    return builder.build();
}

function getDashboardId(embedJwt: CreateEmbedJwt) {
    return isDashboardUuidContent(embedJwt.content)
        ? embedJwt.content.dashboardUuid
        : embedJwt.content.dashboardSlug;
}

/**
 * Main function to hydrate an embedded user with session data and abilities
 */
export function hydrateEmbeddedAccount(
    organization: Pick<Organization, 'organizationUuid' | 'name'>,
    embedJwt: CreateEmbedJwt,
    rawToken: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Account<CreateEmbedJwt> {
    // Build abilities for the embedded user
    const dashboardId = getDashboardId(embedJwt);

    if (!dashboardId) {
        throw new Error('Dashboard UUID is required for dashboard embedding');
    }

    const abilities = buildEmbedAbilities(embedJwt, dashboardId);
    const allowedFilters =
        embedJwt.content.dashboardFiltersInteractivity?.allowedFilters;
    const now = new Date();

    return {
        type: 'embed',
        authentication: {
            type: 'jwt',
            data: embedJwt,
            source: rawToken,
        },
        access: {
            dashboardId,
            dashboards: [
                {
                    id: dashboardId,
                    filters: allowedFilters ?? [],
                },
            ],
        },
        organization,
        // Create the fields we're able to set from the JWT
        user: {
            userUuid: getExternalId(embedJwt, rawToken),
            ability: abilities,
            abilityRules: abilities.rules,
            email: embedJwt.user?.email,
            firstName: '',
            lastName: '',
            organizationUuid: organization.organizationUuid,
            organizationName: organization.name,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: false,
            userId: 0,
            role: OrganizationMemberRole.VIEWER,
            isActive: false,
            createdAt: now,
            updatedAt: now,
        },
    };
}

/**
 * Helper function to extract dashboard UUID from various sources
 *
 * @param embedJwt - The embed JWT token
 * @param pathDashboardUuid - Dashboard UUID from URL path (if available)
 * @returns Dashboard UUID or undefined if not found
 */
export function extractDashboardUuid(
    embedJwt: EmbedJwt,
    pathDashboardUuid?: string,
): string | undefined {
    // Priority: path parameter > JWT content
    if (pathDashboardUuid) {
        return pathDashboardUuid;
    }

    if (isDashboardUuidContent(embedJwt.content)) {
        return embedJwt.content.dashboardUuid;
    }

    return undefined;
}

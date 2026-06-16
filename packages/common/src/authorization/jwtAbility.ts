import { type AbilityBuilder } from '@casl/ability';
import flow from 'lodash/flow';
import { isChartContent, isDashboardContent, type CreateEmbedJwt } from '../ee';
import type { EmbedContent, OssEmbed } from '../types/auth';
import assertUnreachable from '../utils/assertUnreachable';
import type { MemberAbility } from './types';

type EmbeddedAbilityBuilderPayload = {
    embedUser: CreateEmbedJwt;
    content: EmbedContent;
    embed: OssEmbed;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
    externalId: string;
};

type EmbeddedAbilityBuilder = (
    options: EmbeddedAbilityBuilderPayload,
) => EmbeddedAbilityBuilderPayload;

const dashboardAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    content,
    embed,
    externalId,
    builder,
}) => {
    const { organization } = embed;
    const { can } = builder;

    can('view', 'Dashboard', {
        dashboardUuid: content.dashboardUuid,
        organizationUuid: organization.organizationUuid,
    });

    if (
        embedUser.content.type === 'dashboard' &&
        embedUser.content.canDateZoom
    ) {
        can('view', 'Dashboard', {
            dateZoom: true,
            organizationUuid: organization.organizationUuid,
        });
    }

    can('view', 'SavedChart', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    can('view', 'Project', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    // Data app tiles require an explicit opt-in on the JWT — same trust
    // model as canExplore. Off by default, the data app tile renders as a
    // "not authorized" placeholder. With the flag set, the customer is
    // accepting that the embed user can run the data app's metric queries
    // (arbitrary against any explore in the project, still filtered at
    // query time by the JWT's user attributes via getFilteredExplore).
    if (
        embedUser.content.type === 'dashboard' &&
        embedUser.content.canViewDataApps
    ) {
        can('view', 'Explore', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
        });

        can('view', 'DataApp', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
        });
    }

    return { embedUser, content, embed, builder, externalId };
};

const chartAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    content,
    embed,
    externalId,
    builder,
}) => {
    const { organization } = embed;
    const { can } = builder;

    can('view', 'SavedChart', {
        access: {
            $elemMatch: {
                chartUuid: content.chartUuids[0],
            },
        },
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    can('view', 'Explore', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
        exploreNames: { $all: content.explores },
    });

    can('view', 'Project', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
        exploreNames: { $all: content.explores },
    });

    return { embedUser, content, embed, builder, externalId };
};

const dataAppAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    content,
    embed,
    externalId,
    builder,
}) => {
    const { organization } = embed;
    const { can } = builder;

    can('view', 'Project', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    // A standalone data app runs arbitrary metric queries against any explore
    // in the project. The Explore grant MUST be unconstrained (no exploreNames)
    // — a scoped grant would 403 queries the app legitimately needs. Rows are
    // still filtered at query time by the JWT's user attributes
    // (getFilteredExplore). Same trust model as a dashboard's canViewDataApps.
    can('view', 'Explore', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    // Scope to the named app (defense in depth): the preview-token mint checks
    // view:DataApp with metadata.appUuid, so this grant authorizes ONLY this
    // app — a JWT for app A cannot pass the check for app B.
    can('view', 'DataApp', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
        'metadata.appUuid': content.appUuid,
    });

    return { embedUser, content, embed, builder, externalId };
};

const exploreAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    content,
    embed,
    externalId,
    builder,
}) => {
    const { content: permissions } = embedUser;
    const { organization } = embed;
    const { can } = builder;

    const canExplore =
        'canExplore' in permissions ? permissions.canExplore : undefined;
    const canViewUnderlyingData =
        'canViewUnderlyingData' in permissions
            ? permissions.canViewUnderlyingData
            : undefined;

    if (canExplore || canViewUnderlyingData) {
        can('view', 'UnderlyingData', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
        });
    }

    if (canExplore) {
        can('view', 'Explore', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
        });
    }

    return { embedUser, content, embed, externalId, builder };
};

const exportAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    content,
    embed,
    externalId,
    builder,
}) => {
    const { content: permissions } = embedUser;
    const { organization } = embed;
    const { can } = builder;

    if (!isDashboardContent(permissions) && !isChartContent(permissions)) {
        return { embedUser, content, embed, externalId, builder };
    }

    const subjectType: 'Dashboard' | 'SavedChart' =
        content.type === 'dashboard' ? 'Dashboard' : 'SavedChart';

    // Common abilities for both dashboard and chart
    if (permissions.canExportImages) {
        can('export', subjectType, {
            organizationUuid: organization.organizationUuid,
            type: 'images',
        });
    }

    if (permissions.canExportCsv) {
        can('export', subjectType, {
            organizationUuid: organization.organizationUuid,
            type: 'csv',
        });
        can('view', 'JobStatus', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
            createdByUserUuid: externalId,
        });
    }
    // Dashboard specific abilities
    if (isDashboardContent(embedUser.content)) {
        if (embedUser.content.canExportPagePdf) {
            can('export', 'Dashboard', {
                organizationUuid: organization.organizationUuid,
                type: 'pdf',
            });
        }
    }

    return { embedUser, content, embed, externalId, builder };
};

const dashboardTypeAbilities = [
    dashboardAbilities,
    exportAbilities,
    exploreAbilities,
];

const chartTypeAbilities = [chartAbilities, exportAbilities, exploreAbilities];

const dataAppTypeAbilities = [dataAppAbilities];

const getEmbeddedAbilitiesForType = (
    type: EmbedContent['type'],
): EmbeddedAbilityBuilder[] => {
    switch (type) {
        case 'chart':
            return chartTypeAbilities;
        case 'dataApp':
            return dataAppTypeAbilities;
        case 'aiAgent':
            return [];
        case 'dashboard':
            return dashboardTypeAbilities;
        default:
            return assertUnreachable(
                type,
                `Unknown embed content type: ${type}`,
            );
    }
};

export function applyEmbeddedAbility(
    embedUser: CreateEmbedJwt,
    content: EmbedContent,
    embed: OssEmbed,
    externalId: string,
    builder: AbilityBuilder<MemberAbility>,
) {
    if (!content) {
        throw new Error('Content is required');
    }

    const applyAbilities = flow(getEmbeddedAbilitiesForType(content.type));

    applyAbilities({
        embedUser,
        content,
        embed,
        externalId,
        builder,
    });
}

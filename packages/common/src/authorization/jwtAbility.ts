import { type AbilityBuilder } from '@casl/ability';
import flow from 'lodash/flow';
import { isDashboardContent, type CreateEmbedJwt } from '../ee';
import type { EmbedContent, OssEmbed } from '../types/auth';
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

    const abilities =
        content.type === 'chart' ? chartTypeAbilities : dashboardTypeAbilities;
    const applyAbilities = flow(abilities);

    applyAbilities({
        embedUser,
        content,
        embed,
        externalId,
        builder,
    });
}

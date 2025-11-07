import { type AbilityBuilder } from '@casl/ability';
import flow from 'lodash/flow';
import { isDashboardContent, type CreateEmbedJwt } from '../ee';
import type { OssEmbed } from '../types/auth';
import type { MemberAbility } from './types';

type EmbeddedAbilityBuilderPayload = {
    embedUser: CreateEmbedJwt;
    contentUuid: string;
    contentType: 'dashboard' | 'chart';
    embed: OssEmbed;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
    externalId: string;
};

type EmbeddedAbilityBuilder = (
    options: EmbeddedAbilityBuilderPayload,
) => EmbeddedAbilityBuilderPayload;

const dashboardAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    contentUuid,
    contentType,
    embed,
    externalId,
    builder,
}) => {
    const { organization } = embed;
    const { can } = builder;

    can('view', 'Dashboard', {
        dashboardUuid: contentUuid,
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

    return { embedUser, contentUuid, contentType, embed, builder, externalId };
};

const chartAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    contentUuid,
    contentType,
    embed,
    externalId,
    builder,
}) => {
    const { organization } = embed;
    const { can } = builder;

    can('view', 'SavedChart', {
        access: {
            $elemMatch: {
                chartUuid: contentUuid,
            },
        },
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    can('view', 'Project', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    return { embedUser, contentUuid, contentType, embed, builder, externalId };
};

const exploreAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    contentUuid,
    contentType,
    embed,
    externalId,
    builder,
}) => {
    const { content } = embedUser;
    const { organization } = embed;
    const { can } = builder;

    const canExplore = 'canExplore' in content ? content.canExplore : undefined;
    const canViewUnderlyingData =
        'canViewUnderlyingData' in content
            ? content.canViewUnderlyingData
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

    return { embedUser, contentUuid, contentType, embed, externalId, builder };
};

const exportAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    contentUuid,
    contentType,
    embed,
    externalId,
    builder,
}) => {
    const { content } = embedUser;
    const { organization } = embed;
    const { can } = builder;

    const subjectType: 'Dashboard' | 'SavedChart' =
        contentType === 'dashboard' ? 'Dashboard' : 'SavedChart';

    // Common abilities for both dashboard and chart
    if (content.canExportImages) {
        can('export', subjectType, {
            organizationUuid: organization.organizationUuid,
            type: 'images',
        });
    }

    if (content.canExportCsv) {
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
    if (isDashboardContent(content)) {
        if (content.canExportPagePdf) {
            can('export', 'Dashboard', {
                organizationUuid: organization.organizationUuid,
                type: 'pdf',
            });
        }
    }

    return { embedUser, contentUuid, contentType, embed, externalId, builder };
};

const dashboardTypeAbilities = [
    dashboardAbilities,
    exportAbilities,
    exploreAbilities,
];

const chartTypeAbilities = [chartAbilities, exportAbilities, exploreAbilities];

export function applyEmbeddedAbility(
    embedUser: CreateEmbedJwt,
    contentUuid: string | undefined,
    contentType: 'dashboard' | 'chart',
    embed: OssEmbed,
    externalId: string,
    builder: AbilityBuilder<MemberAbility>,
) {
    if (!contentUuid) {
        throw new Error('Content UUID is required');
    }

    const abilities =
        contentType === 'chart' ? chartTypeAbilities : dashboardTypeAbilities;
    const applyAbilities = flow(abilities);

    applyAbilities({
        embedUser,
        contentUuid,
        contentType,
        embed,
        externalId,
        builder,
    });
}

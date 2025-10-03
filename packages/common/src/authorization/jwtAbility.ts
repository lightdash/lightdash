import { type AbilityBuilder } from '@casl/ability';
import flow from 'lodash/flow';
import { type CreateEmbedJwt } from '../ee';
import type { OssEmbed } from '../types/auth';
import type { MemberAbility } from './types';

type EmbeddedAbilityBuilderPayload = {
    embedUser: CreateEmbedJwt;
    dashboardUuid: string;
    embed: OssEmbed;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
    externalId: string;
};

type EmbeddedAbilityBuilder = (
    options: EmbeddedAbilityBuilderPayload,
) => EmbeddedAbilityBuilderPayload;

const dashboardAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    embed,
    externalId,
    builder,
}) => {
    const { organization } = embed;
    const { can } = builder;
    can('view', 'Dashboard', {
        dashboardUuid,
        organizationUuid: organization.organizationUuid,
    });

    if (embedUser.content.canDateZoom) {
        can('view', 'Dashboard', {
            dateZoom: true,
            organizationUuid: organization.organizationUuid,
        });
    }

    can('view', 'SavedChart', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
        isPrivate: false,
    });

    can('view', 'Project', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embed.projectUuid,
    });

    return { embedUser, dashboardUuid, embed, builder, externalId };
};

const exploreAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    embed,
    externalId,
    builder,
}) => {
    const { content } = embedUser;
    const { organization } = embed;
    const { can } = builder;

    if (content.canExplore || content.canViewUnderlyingData) {
        can('view', 'UnderlyingData', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
        });
    }

    if (content.canExplore) {
        can('view', 'Explore', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
        });
    }

    return { embedUser, dashboardUuid, embed, externalId, builder };
};

const exportAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    embed,
    externalId,
    builder,
}) => {
    const { content } = embedUser;
    const { organization } = embed;
    const { can } = builder;

    if (content.canExportCsv) {
        can('export', 'Dashboard', {
            organizationUuid: organization.organizationUuid,
            type: 'csv',
        });

        can('view', 'JobStatus', {
            organizationUuid: organization.organizationUuid,
            projectUuid: embed.projectUuid,
            createdByUserUuid: externalId,
        });
    }

    if (content.canExportPagePdf) {
        can('export', 'Dashboard', {
            organizationUuid: organization.organizationUuid,
            type: 'pdf',
        });
    }

    if (content.canExportImages) {
        can('export', 'Dashboard', {
            organizationUuid: organization.organizationUuid,
            type: 'images',
        });
    }

    return { embedUser, dashboardUuid, embed, externalId, builder };
};

const applyAbilities = flow(
    dashboardAbilities,
    exportAbilities,
    exploreAbilities,
);

export function applyEmbeddedAbility(
    embedUser: CreateEmbedJwt,
    dashboardUuid: string,
    embed: OssEmbed,
    externalId: string,
    builder: AbilityBuilder<MemberAbility>,
) {
    applyAbilities({ embedUser, dashboardUuid, embed, externalId, builder });
}

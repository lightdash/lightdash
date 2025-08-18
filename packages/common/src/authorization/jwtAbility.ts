import { type AbilityBuilder } from '@casl/ability';
import { flow } from 'lodash';
import { type CreateEmbedJwt, type Embed } from '../ee';
import type { MemberAbility } from './types';

type EmbeddedAbilityBuilderPayload = {
    embedUser: CreateEmbedJwt;
    dashboardUuid: string;
    organization: Embed['organization'];
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
};

type EmbeddedAbilityBuilder = (
    options: EmbeddedAbilityBuilderPayload,
) => EmbeddedAbilityBuilderPayload;

const dashboardAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    organization,
    builder,
}) => {
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
        projectUuid: embedUser.content.projectUuid,
        isPrivate: false,
    });

    can('view', 'Project', {
        organizationUuid: organization.organizationUuid,
        projectUuid: embedUser.content.projectUuid,
    });

    return { embedUser, dashboardUuid, organization, builder };
};

const exploreAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    organization,
    builder,
}) => {
    const { content } = embedUser;
    const { can } = builder;

    if (content.canExplore || content.canViewUnderlyingData) {
        can('view', 'UnderlyingData', {
            organizationUuid: organization.organizationUuid,
            projectUuid: content.projectUuid,
        });
    }

    if (content.canExplore) {
        can('view', 'Explore', {
            organizationUuid: organization.organizationUuid,
            projectUuid: content.projectUuid,
        });
    }

    return { embedUser, dashboardUuid, organization, builder };
};

const exportAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    organization,
    builder,
}) => {
    const { content } = embedUser;
    const { can } = builder;

    if (content.canExportCsv) {
        can('export', 'Dashboard', {
            organizationUuid: organization.organizationUuid,
            type: 'csv',
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

    return { embedUser, dashboardUuid, organization, builder };
};

const applyAbilities = flow(
    dashboardAbilities,
    exportAbilities,
    exploreAbilities,
);

export function applyEmbeddedAbility(
    embedUser: CreateEmbedJwt,
    dashboardUuid: string,
    organization: Embed['organization'],
    builder: AbilityBuilder<MemberAbility>,
) {
    applyAbilities({ embedUser, dashboardUuid, organization, builder });
}

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

const addBaseAbilities: EmbeddedAbilityBuilder = ({
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

const dashboardAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    organization,
    builder,
}) => {
    const { content } = embedUser;
    const { can } = builder;

    can('view', 'Dashboard', {
        dateZoom: content.canDateZoom ?? false,
        organizationUuid: organization.organizationUuid,
    });
    return { embedUser, dashboardUuid, organization, builder };
};

const applyAbilities = flow(
    addBaseAbilities,
    exportAbilities,
    dashboardAbilities,
);

export function applyEmbeddedAbility(
    embedUser: CreateEmbedJwt,
    dashboardUuid: string,
    organization: Embed['organization'],
    builder: AbilityBuilder<MemberAbility>,
) {
    applyAbilities({ embedUser, dashboardUuid, organization, builder });
}

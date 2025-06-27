import { type AbilityBuilder } from '@casl/ability';
import { flow } from 'lodash';
import { type CreateEmbedJwt } from '../ee';
import type { MemberAbility } from './types';

type EmbeddedAbilityBuilderPayload = {
    embedUser: CreateEmbedJwt;
    dashboardUuid: string;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
};

type EmbeddedAbilityBuilder = (
    options: EmbeddedAbilityBuilderPayload,
) => EmbeddedAbilityBuilderPayload;

const addBaseAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    builder,
}) => {
    const { content } = embedUser;
    const { can } = builder;
    can('view', 'Dashboard', {
        dashboardUuid,
    });
    can('view', 'SavedChart', {
        projectUuid: content.projectUuid,
        isPrivate: false,
    });
    return { embedUser, dashboardUuid, builder };
};

const exportAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    builder,
}) => {
    const { content } = embedUser;
    const { can } = builder;

    if (content.canExportCsv) {
        can('export', 'Dashboard', 'csv');
    }

    if (content.canExportPagePdf) {
        can('export', 'Dashboard', 'pdf');
    }

    if (content.canExportImages) {
        can('export', 'Dashboard', 'images');
    }

    return { embedUser, dashboardUuid, builder };
};

const dashboardAbilities: EmbeddedAbilityBuilder = ({
    embedUser,
    dashboardUuid,
    builder,
}) => {
    const { content } = embedUser;
    const { can } = builder;

    can('view', 'Dashboard', { dateZoom: content.canDateZoom });
    return { embedUser, dashboardUuid, builder };
};

const applyAbilities = flow(
    addBaseAbilities,
    exportAbilities,
    dashboardAbilities,
);

export function applyEmbeddedAbility(
    embedUser: CreateEmbedJwt,
    dashboardUuid: string,
    builder: AbilityBuilder<MemberAbility>,
) {
    applyAbilities({ embedUser, dashboardUuid, builder });
}

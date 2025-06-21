import { type AbilityBuilder } from '@casl/ability';

import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { ProjectType } from '../types/projects';
import { type MemberAbility } from './types';

type ServiceAccountAbilitiesArgs = {
    organizationUuid: string;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
};

const applyServiceAccountStaticAbilities: Record<
    ServiceAccountScope,
    (args: ServiceAccountAbilitiesArgs) => void
> = {
    [ServiceAccountScope.ORG_READ]: ({
        organizationUuid,
        builder: { can },
    }) => {
        can('view', 'OrganizationMemberProfile', {
            organizationUuid,
        });
        can('view', 'JobStatus', {
            // createdByUserUuid: userUuid,
        });
        can('view', 'PinnedItems', {
            organizationUuid,
        });

        can('view', 'Dashboard', {
            organizationUuid,
            isPrivate: false,
        });
        can('view', 'SavedChart', {
            organizationUuid,
            isPrivate: false,
        });
        can('view', 'Dashboard', {
            organizationUuid,
            /* access: {
                $elemMatch: { userUuid: userUuid },
            }, */
        });
        can('view', 'SavedChart', {
            organizationUuid,
            /*
           access: {
                $elemMatch: { userUuid: userUuid },
            }, */
        });
        can('view', 'Space', {
            organizationUuid,
            isPrivate: false,
        });
        can('view', 'Space', {
            organizationUuid,
            /* access: {
                $elemMatch: { userUuid: userUuid },
            }, */
        });
        can('view', 'Project', {
            organizationUuid,
        });
        can('view', 'Organization', {
            organizationUuid,
        });
        can('manage', 'ExportCsv', {
            organizationUuid,
        });
        can('view', 'DashboardComments', {
            organizationUuid,
        });
        can('view', 'Tags', {
            organizationUuid,
        });
        can('view', 'MetricsTree', {
            organizationUuid,
        });
        can('view', 'SpotlightTableConfig', {
            organizationUuid,
        });
        can('view', 'AiAgentThread', {
            organizationUuid,
            // userUuid: userUuid,
        });

        can('create', 'Job');
        can(
            'view',
            'Job',
            // { userUuid: userUuid }
        );
        can('view', 'UnderlyingData', {
            organizationUuid,
        });
        can('view', 'SemanticViewer', {
            organizationUuid,
        });
        can('manage', 'ChangeCsvResults', {
            organizationUuid,
        });
        can('manage', 'Explore', {
            organizationUuid,
        });
        can('create', 'ScheduledDeliveries', {
            organizationUuid,
        });
        can('create', 'DashboardComments', {
            organizationUuid,
        });
        can('manage', 'Dashboard', {
            organizationUuid,
            /*  access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            }, */
        });
        can('manage', 'SavedChart', {
            organizationUuid,
            /* access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            }, */
        });

        can('manage', 'SemanticViewer', {
            organizationUuid,
            /*  access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            }, */
        });
        can('manage', 'Dashboard', {
            organizationUuid,
            /* access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            }, */
        });
        can('manage', 'SavedChart', {
            organizationUuid,
            /* access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            }, */
        });

        can('manage', 'Space', {
            organizationUuid,
            /*  access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            }, */
        });

        can('view', 'AiAgent', {
            organizationUuid,
        });
        can('create', 'AiAgentThread', {
            organizationUuid,
        });
    },
    [ServiceAccountScope.ORG_EDIT]: ({
        organizationUuid,
        builder: { can },
    }) => {
        applyServiceAccountStaticAbilities[ServiceAccountScope.ORG_READ]({
            organizationUuid,
            builder: { can },
        });
        can('manage', 'Space', {
            organizationUuid,
            isPrivate: false,
        });
        can('create', 'Space', {
            organizationUuid,
        });
        can('manage', 'Job');
        can('manage', 'PinnedItems', {
            organizationUuid,
        });
        can('manage', 'ScheduledDeliveries', {
            organizationUuid,
        });
        can('manage', 'DashboardComments', {
            organizationUuid,
        });
        can('manage', 'SemanticViewer', {
            organizationUuid,
        });
        can('manage', 'Tags', {
            organizationUuid,
        });
        can('manage', 'MetricsTree', {
            organizationUuid,
        });
    },
    [ServiceAccountScope.ORG_ADMIN]: ({
        organizationUuid,
        builder: { can },
    }) => {
        applyServiceAccountStaticAbilities[ServiceAccountScope.ORG_EDIT]({
            organizationUuid,
            builder: { can },
        });
        can('manage', 'VirtualView', {
            organizationUuid,
        });
        can('manage', 'CustomSql', {
            organizationUuid,
        });
        can('manage', 'SqlRunner', {
            organizationUuid,
        });
        can('manage', 'Validation', {
            organizationUuid,
        });
        can('promote', 'SavedChart', {
            organizationUuid,
            /* access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            }, */
        });
        can('promote', 'Dashboard', {
            organizationUuid,
            /* access: {
                $elemMatch: {
                    userUuid: userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            }, */
        });
        can('manage', 'CompileProject', {
            organizationUuid,
        });
        can('create', 'Project', {
            organizationUuid,
            type: ProjectType.PREVIEW,
        });
        can('update', 'Project', {
            organizationUuid,
        });
        can('delete', 'Project', {
            organizationUuid,
            type: ProjectType.PREVIEW,
        });
        can('manage', 'SpotlightTableConfig', {
            organizationUuid,
        });
        can('manage', 'ContentAsCode', {
            organizationUuid,
        });
        can('view', 'JobStatus', {
            organizationUuid,
        });
        can('manage', 'AiAgent', {
            organizationUuid,
        });
        can('manage', 'AiAgentThread', {
            organizationUuid,
            //  userUuid: userUuid,
        });
        can('manage', 'Dashboard', {
            organizationUuid,
        });
        can('manage', 'Space', {
            organizationUuid,
        });
        can('manage', 'SavedChart', {
            organizationUuid,
        });
        can('create', 'Project', {
            organizationUuid,
            type: { $in: [ProjectType.DEFAULT, ProjectType.PREVIEW] },
        });
        can('delete', 'Project', {
            organizationUuid,
        });
        can('manage', 'Project', {
            organizationUuid,
        });
        can('manage', 'InviteLink', {
            organizationUuid,
        });
        can('manage', 'Organization', {
            organizationUuid,
        });
        can('view', 'Analytics', {
            organizationUuid,
        });
        can('manage', 'OrganizationMemberProfile', {
            organizationUuid,
        });
        can('manage', 'PinnedItems', {
            organizationUuid,
        });
        can('manage', 'Group', {
            organizationUuid,
        });
        can('view', 'AiAgentThread', {
            organizationUuid,
        });
        can('manage', 'AiAgentThread', {
            organizationUuid,
        });
    },
    // TODO migrate SCIM permissions to abilities
    [ServiceAccountScope.SCIM_MANAGE]: ({
        organizationUuid: _organizationUuid,
        builder: { can: _can },
    }) => {},
};

export const applyServiceAccountAbilities = ({
    organizationUuid,
    builder,
    scopes,
}: ServiceAccountAbilitiesArgs & {
    scopes: ServiceAccountScope[];
}) => {
    scopes.forEach((scope) => {
        applyServiceAccountStaticAbilities[scope]({
            organizationUuid,
            builder,
        });
    });
};

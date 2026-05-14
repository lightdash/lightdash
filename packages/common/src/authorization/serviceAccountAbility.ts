import { type AbilityBuilder } from '@casl/ability';
import { ServiceAccountScope } from '../ee/serviceAccounts/types';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { ProjectType } from '../types/projects';
import { applyOrganizationMemberStaticAbilities } from './organizationMemberAbility';
import { type MemberAbility } from './types';

type ServiceAccountAbilitiesArgs = {
    organizationUuid: string;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
    // Dedicated user uuid for the service account. Required so that
    // `*@self`-style ability conditions (e.g. `manage:DeployProject@self`,
    // `delete:Project@self`) resolve to the SA's own row rather than
    // matching nothing. Older legacy-scope handlers that don't reference
    // userUuid keep working unchanged.
    userUuid: string;
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
            inheritsFromOrgOrProject: true,
        });
        can('view', 'SavedChart', {
            organizationUuid,
            inheritsFromOrgOrProject: true,
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
            inheritsFromOrgOrProject: true,
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
        userUuid,
        builder: { can },
    }) => {
        applyServiceAccountStaticAbilities[ServiceAccountScope.ORG_READ]({
            organizationUuid,
            userUuid,
            builder: { can },
        });
        can('manage', 'Space', {
            organizationUuid,
            inheritsFromOrgOrProject: true,
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
        // CLI-driven content-as-code upload (`lightdash upload`) runs as an
        // SA with `org:edit`. Pre-Phase-C the auth middleware spoofed the
        // admin user so the call was implicitly allowed; the cutover to a
        // dedicated SA identity dropped that side-effect, so we restore it
        // here explicitly to preserve the existing CI workflow.
        can('manage', 'ContentAsCode', {
            organizationUuid,
        });
    },
    [ServiceAccountScope.ORG_ADMIN]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyServiceAccountStaticAbilities[ServiceAccountScope.ORG_EDIT]({
            organizationUuid,
            userUuid,
            builder: { can },
        });
        can('manage', 'PreAggregation', {
            organizationUuid,
        });
        can('manage', 'VirtualView', {
            organizationUuid,
        });
        can('manage', 'CustomSql', {
            organizationUuid,
        });
        can('manage', 'CustomFields', {
            organizationUuid,
        });
        can('manage', 'CustomSqlTableCalculations', {
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
        can('manage', 'DeployProject', {
            organizationUuid,
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
        can('manage', 'ContentVerification', {
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
        can('manage', 'DataApp', {
            organizationUuid,
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
    [ServiceAccountScope.SCIM_MANAGE]: ({
        organizationUuid,
        builder: { can },
    }) => {
        can('manage', 'OrganizationMemberProfile', {
            organizationUuid,
        });
        can('manage', 'Group', {
            organizationUuid,
        });
    },
    // System-role aliases. Each one delegates to the matching org-member
    // ability builder so the SA's CASL is exactly the user-with-this-role
    // shape — no parallel scope mapping to drift out of sync.
    [ServiceAccountScope.SYSTEM_MEMBER]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyOrganizationMemberStaticAbilities[OrganizationMemberRole.MEMBER](
            { organizationUuid, userUuid },
            { can },
        );
    },
    [ServiceAccountScope.SYSTEM_ADMIN]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyOrganizationMemberStaticAbilities[OrganizationMemberRole.ADMIN](
            { organizationUuid, userUuid },
            { can },
        );
    },
    [ServiceAccountScope.SYSTEM_DEVELOPER]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyOrganizationMemberStaticAbilities[
            OrganizationMemberRole.DEVELOPER
        ]({ organizationUuid, userUuid }, { can });
    },
    [ServiceAccountScope.SYSTEM_EDITOR]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyOrganizationMemberStaticAbilities[OrganizationMemberRole.EDITOR](
            { organizationUuid, userUuid },
            { can },
        );
    },
    [ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyOrganizationMemberStaticAbilities[
            OrganizationMemberRole.INTERACTIVE_VIEWER
        ]({ organizationUuid, userUuid }, { can });
    },
    [ServiceAccountScope.SYSTEM_VIEWER]: ({
        organizationUuid,
        userUuid,
        builder: { can },
    }) => {
        applyOrganizationMemberStaticAbilities[OrganizationMemberRole.VIEWER](
            { organizationUuid, userUuid },
            { can },
        );
    },
};

export const applyServiceAccountAbilities = ({
    organizationUuid,
    userUuid,
    builder,
    scopes,
}: ServiceAccountAbilitiesArgs & {
    scopes: ServiceAccountScope[];
}) => {
    scopes.forEach((scope) => {
        applyServiceAccountStaticAbilities[scope]({
            organizationUuid,
            userUuid,
            builder,
        });
    });
};

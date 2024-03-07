import {
    type DashboardsTableName,
    type DashboardTable,
    type DashboardTileChartTable,
    type DashboardTileChartTableName,
    type DashboardTileLoomsTable,
    type DashboardTileLoomsTableName,
    type DashboardTileMarkdownsTable,
    type DashboardTileMarkdownsTableName,
    type DashboardTilesTableName,
    type DashboardTileTable,
    type DashboardTileTypesTableName,
    type DashboardVersionsTableName,
    type DashboardVersionTable,
    type DashboardViewsTableName,
    type DashboardViewTable,
} from '../database/entities/dashboards';
import {
    type DbtCloudIntegrationsTable,
    type DbtCloudIntegrationsTableName,
} from '../database/entities/dbtCloudIntegrations';
import { type EmailTable, type EmailTableName } from '../database/entities/emails';
import {
    type InviteLinkTable,
    type InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    type JobsTable,
    type JobsTableName,
    type JobStepsTable,
    type JobStepsTableName,
} from '../database/entities/jobs';
import {
    type OnboardingTable,
    type OnboardingTableName,
} from '../database/entities/onboarding';
import {
    type OpenIdIdentitiesTable,
    type OpenIdIdentitiesTableName,
} from '../database/entities/openIdIdentities';
import {
    type OrganizationMembershipsTable,
    type OrganizationMembershipsTableName,
} from '../database/entities/organizationMemberships';
import {
    type OrganizationTable,
    type OrganizationTableName,
} from '../database/entities/organizations';
import {
    type PasswordLoginTable,
    type PasswordLoginTableName,
} from '../database/entities/passwordLogins';
import {
    type PasswordResetTable,
    type PasswordResetTableName,
} from '../database/entities/passwordResetLinks';
import {
    type PersonalAccessTokenTable,
    type PersonalAccessTokenTableName,
} from '../database/entities/personalAccessTokens';
import {
    type PinnedChartTable,
    type PinnedChartTableName,
    type PinnedDashboardTable,
    type PinnedDashboardTableName,
    type PinnedListTable,
    type PinnedListTableName,
    type PinnedSpaceTable,
    type PinnedSpaceTableName,
} from '../database/entities/pinnedList';
import {
    type ProjectMembershipsTable,
    type ProjectMembershipsTableName,
} from '../database/entities/projectMemberships';
import {
    type CachedExploresTable,
    type CachedExploresTableName,
    type CachedExploreTable,
    type CachedExploreTableName,
    type CachedWarehouseTable,
    type CachedWarehouseTableName,
    type ProjectTable,
    type ProjectTableName,
} from '../database/entities/projects';
import {
    type SavedChartAdditionalMetricTable,
    type SavedChartAdditionalMetricTableName,
    type SavedChartCustomDimensionsTable,
    type SavedChartCustomDimensionsTableName,
    type SavedChartsTableName,
    type SavedChartTable,
    type SavedChartTableCalculationTable,
    type SavedChartTableCalculationTableName,
    type SavedChartVersionFieldsTable,
    type SavedChartVersionFieldsTableName,
    type SavedChartVersionSortsTable,
    type SavedChartVersionSortsTableName,
    type SavedChartVersionsTable,
    type SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { type SessionTable, type SessionTableName } from '../database/entities/sessions';
import { type ShareTable, type ShareTableName } from '../database/entities/share';
import {
    type DbSlackAuthTokens,
    type SlackAuthTokensTable,
} from '../database/entities/slackAuthentication';
import {
    type SpaceShareTable,
    type SpaceShareTableName,
    type SpaceTable,
    type SpaceTableName,
} from '../database/entities/spaces';
import { type UserTable, type UserTableName } from '../database/entities/users';
import {
    type WarehouseCredentialTable,
    type WarehouseCredentialTableName,
} from '../database/entities/warehouseCredentials';

import {
    type AnalyticsChartViewsTableName,
    type AnalyticsDashboardViewsTableName,
    type DbAnalyticsChartViews,
    type DbAnalyticsDashboardViews,
} from '../database/entities/analytics';
import {
    type DashboardTileCommentsTable,
    type DashboardTileCommentsTableName,
} from '../database/entities/comments';
import {
    type DownloadFileTable,
    type DownloadFileTableName,
} from '../database/entities/downloadFile';
import {
    type EmailOneTimePasscodesTableName,
    type EmailOneTimePasscodeTable,
} from '../database/entities/emailOneTimePasscodes';
import {
    type GithubAppInstallationTable,
    type GithubAppInstallationTableName,
} from '../database/entities/githubAppInstallation';
import {
    type GroupMembershipTable,
    type GroupMembershipTableName,
} from '../database/entities/groupMemberships';
import { type GroupTable, type GroupTableName } from '../database/entities/groups';
import {
    type NotificationsTable,
    type NotificationsTableName,
} from '../database/entities/notifications';
import {
    type OrganizationAllowedEmailDomainProjectsTable,
    type OrganizationAllowedEmailDomainProjectsTableName,
    type OrganizationAllowedEmailDomainsTable,
    type OrganizationAllowedEmailDomainsTableName,
} from '../database/entities/organizationsAllowedEmailDomains';
import {
    type ProjectGroupAccessTable,
    type ProjectGroupAccessTableName,
} from '../database/entities/projectGroupAccess';
import {
    type SchedulerEmailTargetTable,
    type SchedulerEmailTargetTableName,
    type SchedulerLogTable,
    type SchedulerLogTableName,
    type SchedulerSlackTargetTable,
    type SchedulerSlackTargetTableName,
    type SchedulerTable,
    type SchedulerTableName,
} from '../database/entities/scheduler';
import {
    type SshKeyPairTable,
    type SshKeyPairTableName,
} from '../database/entities/sshKeyPairs';
import {
    type DbGroupUserAttribute,
    type DbOrganizationMemberUserAttribute,
    type DbUserAttribute,
    type GroupUserAttributesTable,
    type OrganizationMemberUserAttributesTable,
    type UserAttributesTable,
} from '../database/entities/userAttributes';
import {
    type ProjectUserWarehouseCredentialPreferenceTable,
    type ProjectUserWarehouseCredentialPreferenceTableName,
    type UserWarehouseCredentialsTable,
    type UserWarehouseCredentialsTableName,
} from '../database/entities/userWarehouseCredentials';
import {
    type DbValidationTable,
    type ValidationTableName,
} from '../database/entities/validation';

declare module 'knex/types/tables' {
    interface Tables {
        [InviteLinkTableName]: InviteLinkTable;
        [OrganizationTableName]: OrganizationTable;
        [UserTableName]: UserTable;
        [EmailTableName]: EmailTable;
        [SessionTableName]: SessionTable;
        [WarehouseCredentialTableName]: WarehouseCredentialTable;
        [UserWarehouseCredentialsTableName]: UserWarehouseCredentialsTable;
        [ProjectUserWarehouseCredentialPreferenceTableName]: ProjectUserWarehouseCredentialPreferenceTable;
        [ProjectTableName]: ProjectTable;
        [SavedChartsTableName]: SavedChartTable;
        [SavedChartVersionsTableName]: SavedChartVersionsTable;
        [SavedChartVersionFieldsTableName]: SavedChartVersionFieldsTable;
        [SavedChartVersionSortsTableName]: SavedChartVersionSortsTable;
        [SavedChartTableCalculationTableName]: SavedChartTableCalculationTable;
        [SavedChartAdditionalMetricTableName]: SavedChartAdditionalMetricTable;
        [SpaceTableName]: SpaceTable;
        [DashboardsTableName]: DashboardTable;
        [DashboardVersionsTableName]: DashboardVersionTable;
        [DashboardViewsTableName]: DashboardViewTable;
        [DashboardTilesTableName]: DashboardTileTable;
        [DashboardTileTypesTableName]: DashboardTileTypesTable;
        [DashboardTileChartTableName]: DashboardTileChartTable;
        [DashboardTileLoomsTableName]: DashboardTileLoomsTable;
        [DashboardTileMarkdownsTableName]: DashboardTileMarkdownsTable;
        [OnboardingTableName]: OnboardingTable;
        [OpenIdIdentitiesTableName]: OpenIdIdentitiesTable;
        [OrganizationMembershipsTableName]: OrganizationMembershipsTable;
        [PasswordResetTableName]: PasswordResetTable;
        [PasswordLoginTableName]: PasswordLoginTable;
        [CachedExploresTableName]: CachedExploresTable;
        [CachedExploreTableName]: CachedExploreTable;
        [CachedWarehouseTableName]: CachedWarehouseTable;
        [JobsTableName]: JobsTable;
        [JobStepsTableName]: JobStepsTable;
        [PersonalAccessTokenTableName]: PersonalAccessTokenTable;
        [ProjectMembershipsTableName]: ProjectMembershipsTable;
        [ProjectGroupAccessTableName]: ProjectGroupAccessTable;
        [DbtCloudIntegrationsTableName]: DbtCloudIntegrationsTable;
        [ShareTableName]: ShareTable;
        [SpaceShareTableName]: SpaceShareTable;
        [SlackAuthTokensTable]: DbSlackAuthTokens;
        [AnalyticsChartViewsTableName]: DbAnalyticsChartViews;
        [AnalyticsDashboardViewsTableName]: DbAnalyticsDashboardViews;
        [PinnedListTableName]: PinnedListTable;
        [PinnedChartTableName]: PinnedChartTable;
        [PinnedDashboardTableName]: PinnedDashboardTable;
        [PinnedSpaceTableName]: PinnedSpaceTable;
        [SchedulerTableName]: SchedulerTable;
        [SchedulerSlackTargetTableName]: SchedulerSlackTargetTable;
        [SchedulerEmailTargetTableName]: SchedulerEmailTargetTable;
        [EmailOneTimePasscodesTableName]: EmailOneTimePasscodeTable;
        [SchedulerLogTableName]: SchedulerLogTable;
        [OrganizationAllowedEmailDomainsTableName]: OrganizationAllowedEmailDomainsTable;
        [OrganizationAllowedEmailDomainProjectsTableName]: OrganizationAllowedEmailDomainProjectsTable;
        [ValidationTableName]: DbValidationTable;
        [GroupTableName]: GroupTable;
        [GroupMembershipTableName]: GroupMembershipTable;
        [SshKeyPairTableName]: SshKeyPairTable;
        [UserAttributesTable]: DbUserAttribute;
        [OrganizationMemberUserAttributesTable]: DbOrganizationMemberUserAttribute;
        [GroupUserAttributesTable]: DbGroupUserAttribute;
        [SavedChartCustomDimensionsTableName]: SavedChartCustomDimensionsTable;
        [DownloadFileTableName]: DownloadFileTable;
        [GithubAppInstallationTableName]: GithubAppInstallationTable;
        [DashboardTileCommentsTableName]: DashboardTileCommentsTable;
        [NotificationsTableName]: NotificationsTable;
    }
}

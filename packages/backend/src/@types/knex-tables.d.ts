import {
    DashboardsTableName,
    DashboardTable,
    DashboardTileChartTable,
    DashboardTileChartTableName,
    DashboardTileLoomsTable,
    DashboardTileLoomsTableName,
    DashboardTileMarkdownsTable,
    DashboardTileMarkdownsTableName,
    DashboardTilesTableName,
    DashboardTileTable,
    DashboardTileTypesTableName,
    DashboardVersionsTableName,
    DashboardVersionTable,
    DashboardViewsTableName,
    DashboardViewTable,
} from '../database/entities/dashboards';
import { EmailTable, EmailTableName } from '../database/entities/emails';
import {
    InviteLinkTable,
    InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    JobsTable,
    JobsTableName,
    JobStepsTable,
    JobStepsTableName,
} from '../database/entities/jobs';
import {
    OnboardingTable,
    OnboardingTableName,
} from '../database/entities/onboarding';
import {
    OpenIdIdentitiesTable,
    OpenIdIdentitiesTableName,
} from '../database/entities/openIdIdentities';
import {
    OrganizationMembershipsTable,
    OrganizationMembershipsTableName,
} from '../database/entities/organizationMemberships';
import {
    OrganizationTable,
    OrganizationTableName,
} from '../database/entities/organizations';
import {
    PasswordLoginTable,
    PasswordLoginTableName,
} from '../database/entities/passwordLogins';
import {
    PasswordResetTable,
    PasswordResetTableName,
} from '../database/entities/passwordResetLinks';
import {
    PersonalAccessTokenTable,
    PersonalAccessTokenTableName,
} from '../database/entities/personalAccessTokens';
import {
    ProjectMembershipsTable,
    ProjectMembershipsTableName,
} from '../database/entities/projectMemberships';
import {
    CachedExploresTable,
    CachedExploresTableName,
    CachedWarehouseTable,
    CachedWarehouseTableName,
    ProjectTable,
    ProjectTableName,
} from '../database/entities/projects';
import {
    SavedChartsTableName,
    SavedChartVersionFieldsTable,
    SavedChartVersionFieldsTableName,
    SavedChartVersionSortsTable,
    SavedChartVersionSortsTableName,
    SavedChartVersionsTable,
    SavedChartVersionsTableName,
    SavedQueryTable,
    SavedQueryTableCalculationTable,
    SavedQueryTableCalculationTableName,
} from '../database/entities/savedCharts';
import { SessionTable, SessionTableName } from '../database/entities/sessions';
import { ShareTable, ShareTableName } from '../database/entities/share';
import { SpaceTable, SpaceTableName } from '../database/entities/spaces';
import { UserTable, UserTableName } from '../database/entities/users';
import {
    WarehouseCredentialTable,
    WarehouseCredentialTableName,
} from '../database/entities/warehouseCredentials';

declare module 'knex/types/tables' {
    interface Tables {
        [InviteLinkTableName]: InviteLinkTable;
        [OrganizationTableName]: OrganizationTable;
        [UserTableName]: UserTable;
        [EmailTableName]: EmailTable;
        [SessionTableName]: SessionTable;
        [WarehouseCredentialTableName]: WarehouseCredentialTable;
        [ProjectTableName]: ProjectTable;
        [SavedChartsTableName]: SavedQueryTable;
        [SavedChartVersionsTableName]: SavedChartVersionsTable;
        [SavedChartVersionFieldsTableName]: SavedChartVersionFieldsTable;
        [SavedChartVersionSortsTableName]: SavedChartVersionSortsTable;
        [SavedQueryTableCalculationTableName]: SavedQueryTableCalculationTable;
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
        [CachedWarehouseTableName]: CachedWarehouseTable;
        [JobsTableName]: JobsTable;
        [JobStepsTableName]: JobStepsTable;
        [PersonalAccessTokenTableName]: PersonalAccessTokenTable;
        [ProjectMembershipsTableName]: ProjectMembershipsTable;
        [ShareTableName]: ShareTable;
    }
}

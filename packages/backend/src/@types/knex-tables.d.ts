import {
    InviteLinkTable,
    InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    OrganizationTableName,
    OrganizationTable,
} from '../database/entities/organizations';
import { UserTable, UserTableName } from '../database/entities/users';
import { EmailTable, EmailTableName } from '../database/entities/emails';
import { SessionTable, SessionTableName } from '../database/entities/sessions';
import {
    SavedQueriesTableName,
    SavedQueryTable,
    SavedQueryTableCalculationTable,
    SavedQueryTableCalculationTableName,
} from '../database/entities/savedQueries';
import {
    WarehouseCredentialTable,
    WarehouseCredentialTableName,
} from '../database/entities/warehouseCredentials';
import { ProjectTable, ProjectTableName } from '../database/entities/projects';
import { SpaceTable, SpaceTableName } from '../database/entities/spaces';
import {
    DashboardTable,
    DashboardsTableName,
    DashboardTileChartTable,
    DashboardTileChartTableName,
    DashboardTilesTableName,
    DashboardTileTypesTableName,
    DashboardVersionTable,
    DashboardTileTable,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';

declare module 'knex/types/tables' {
    interface Tables {
        [InviteLinkTableName]: InviteLinkTable;
        [OrganizationTableName]: OrganizationTable;
        [UserTableName]: UserTable;
        [EmailTableName]: EmailTable;
        [SessionTableName]: SessionTable;
        [WarehouseCredentialTableName]: WarehouseCredentialTable;
        [ProjectTableName]: ProjectTable;
        [SavedQueriesTableName]: SavedQueryTable;
        [SavedQueryTableCalculationTableName]: SavedQueryTableCalculationTable;
        [SpaceTableName]: SpaceTable;
        [DashboardsTableName]: DashboardTable;
        [DashboardVersionsTableName]: DashboardVersionTable;
        [DashboardTilesTableName]: DashboardTileTable;
        [DashboardTileTypesTableName]: DashboardTileTypesTable;
        [DashboardTileChartTableName]: DashboardTileChartTable;
    }
}

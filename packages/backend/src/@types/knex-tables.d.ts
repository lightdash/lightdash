import {
    DashboardsTableName,
    DashboardTable,
    DashboardTileChartTable,
    DashboardTileChartTableName,
    DashboardTilesTableName,
    DashboardTileTable,
    DashboardTileTypesTableName,
    DashboardVersionsTableName,
    DashboardVersionTable,
} from '../database/entities/dashboards';
import { EmailTable, EmailTableName } from '../database/entities/emails';
import {
    InviteLinkTable,
    InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    OrganizationTable,
    OrganizationTableName,
} from '../database/entities/organizations';
import { ProjectTable, ProjectTableName } from '../database/entities/projects';
import {
    SavedQueriesTableName,
    SavedQueryTable,
    SavedQueryTableCalculationTable,
    SavedQueryTableCalculationTableName,
} from '../database/entities/savedQueries';
import { SessionTable, SessionTableName } from '../database/entities/sessions';
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

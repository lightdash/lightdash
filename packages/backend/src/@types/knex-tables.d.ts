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
    SavedQueryTableCalculationTable,
    SavedQueryTableCalculationTableName,
} from '../database/entities/savedQueries';
import {
    WarehouseCredentialTable,
    WarehouseCredentialTableName,
} from '../database/entities/warehouseCredentials';
import { ProjectTable, ProjectTableName } from '../database/entities/projects';

declare module 'knex/types/tables' {
    interface Tables {
        [InviteLinkTableName]: InviteLinkTable;
        [OrganizationTableName]: OrganizationTable;
        [UserTableName]: UserTable;
        [EmailTableName]: EmailTable;
        [SessionTableName]: SessionTable;
        [WarehouseCredentialTableName]: WarehouseCredentialTable;
        [ProjectTableName]: ProjectTable;
        [SavedQueryTableCalculationTableName]: SavedQueryTableCalculationTable;
    }
}

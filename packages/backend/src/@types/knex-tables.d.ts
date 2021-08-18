import {
    InviteLinkTable,
    InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    OrganizationTableName,
    OrganizationTable,
} from '../database/entities/organizations';
import { UserTable, UserTableName } from '../database/entities/users';

declare module 'knex/types/tables' {
    interface Tables {
        [InviteLinkTableName]: InviteLinkTable;
        [OrganizationTableName]: OrganizationTable;
        [UserTableName]: UserTable;
    }
}

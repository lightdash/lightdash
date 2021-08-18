import {
    InviteLinkTable,
    InviteLinkTableName,
} from '../database/entities/inviteLinks';
import {
    OrganizationTableName,
    OrganizationTable,
} from '../database/entities/organizations';

declare module 'knex/types/tables' {
    interface Tables {
        [InviteLinkTableName]: InviteLinkTable;
        [OrganizationTableName]: OrganizationTable;
    }
}

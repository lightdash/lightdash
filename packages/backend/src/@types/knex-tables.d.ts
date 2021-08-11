import { InviteLinkTable } from '../database/entities/inviteLinks';

declare module 'knex/types/tables' {
    interface Tables {
        invite_links: InviteLinkTable;
    }
}

import { type OrganizationJoinRequestStatus } from '@lightdash/common';
import { Knex } from 'knex';

export const OrganizationJoinRequestsTableName = 'organization_join_requests';

export type DbOrganizationJoinRequest = {
    join_request_uuid: string;
    organization_uuid: string;
    user_uuid: string;
    status: OrganizationJoinRequestStatus;
    created_at: Date;
    expires_at: Date;
    decided_at: Date | null;
    decided_by_user_uuid: string | null;
};

export type OrganizationJoinRequestsTable = Knex.CompositeTableType<
    DbOrganizationJoinRequest,
    Pick<
        DbOrganizationJoinRequest,
        | 'join_request_uuid'
        | 'organization_uuid'
        | 'user_uuid'
        | 'status'
        | 'expires_at'
    >,
    Partial<
        Pick<
            DbOrganizationJoinRequest,
            'status' | 'decided_at' | 'decided_by_user_uuid'
        >
    >
>;

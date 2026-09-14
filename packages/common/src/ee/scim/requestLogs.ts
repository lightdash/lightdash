import { type KnexPaginatedData } from '../../types/knex-paginate';

export enum ScimRequestAction {
    CREATE_USER = 'create_user',
    UPDATE_USER = 'update_user',
    DEACTIVATE_USER = 'deactivate_user',
    DELETE_USER = 'delete_user',
    ROLE_CHANGE = 'role_change',
    MEMBERSHIP_CHANGE = 'membership_change',
    CREATE_GROUP = 'create_group',
    UPDATE_GROUP = 'update_group',
    DELETE_GROUP = 'delete_group',
    LOOKUP = 'lookup',
    LIST = 'list',
    UNKNOWN = 'unknown',
}

export type ScimRequestLog = {
    uuid: string;
    organizationUuid: string;
    serviceAccountUuid: string | null;
    tokenDescription: string | null;
    method: string;
    url: string;
    action: ScimRequestAction;
    targetIdentity: string | null;
    targetUuid: string | null;
    affectedRoles: string[];
    status: number;
    errorDetail: string | null;
    scimType: string | null;
    createdAt: Date;
};

export type ApiScimRequestLogListResponse = {
    status: 'ok';
    results: KnexPaginatedData<ScimRequestLog[]>;
};

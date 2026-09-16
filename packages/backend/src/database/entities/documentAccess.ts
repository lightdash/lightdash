import { type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';

export const DocumentUserAccessTableName = 'document_user_access';
export const DocumentGroupAccessTableName = 'document_group_access';

export type DbDocumentUserAccess = {
    document_uuid: string;
    user_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DocumentUserAccessTable = Knex.CompositeTableType<
    DbDocumentUserAccess,
    Omit<DbDocumentUserAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbDocumentUserAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;

export type DbDocumentGroupAccess = {
    document_uuid: string;
    group_uuid: string;
    space_role: SpaceMemberRole;
    granted_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DocumentGroupAccessTable = Knex.CompositeTableType<
    DbDocumentGroupAccess,
    Omit<DbDocumentGroupAccess, 'created_at' | 'updated_at'>,
    Pick<
        DbDocumentGroupAccess,
        'space_role' | 'granted_by_user_uuid' | 'updated_at'
    >
>;

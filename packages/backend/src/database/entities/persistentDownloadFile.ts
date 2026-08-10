import { type PersistentDownloadFileAccessMode } from '@lightdash/common';
import { Knex } from 'knex';

export const PersistentDownloadFileTableName = 'persistent_download_files';

export type DbPersistentDownloadFile = {
    nanoid: string;
    s3_key: string;
    file_type: string;
    organization_uuid: string;
    project_uuid: string | null;
    created_by_user_uuid: string | null;
    access_mode: PersistentDownloadFileAccessMode;
    created_at: Date;
    expires_at: Date;
};

type CreatePersistentDownloadFile = Omit<
    DbPersistentDownloadFile,
    'created_at'
>;

export type PersistentDownloadFileTable = Knex.CompositeTableType<
    DbPersistentDownloadFile,
    CreatePersistentDownloadFile
>;

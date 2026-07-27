import { Knex } from 'knex';

export const DownloadFileTableName = 'download_files';

export type DbDownloadFile = {
    nanoid: string;
    path: string;
    type: string;
    created_at: Date;
    project_uuid: string | null;
};

type CreateDownloadFile = Omit<DbDownloadFile, 'created_at'>;

export type DownloadFileTable = Knex.CompositeTableType<
    DbDownloadFile,
    CreateDownloadFile
>;

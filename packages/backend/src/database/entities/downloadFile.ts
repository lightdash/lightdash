import { Knex } from 'knex';

export const DownloadFileTableName = 'download_files';

export type DbDownloadFile = {
    nanoid: string;
    path: string;
    type: string;
    created_at: Date;
};

type CreateDownloadFile = Omit<DbDownloadFile, 'created_at'>;

export type DownloadFileTable = Knex.CompositeTableType<
    DbDownloadFile,
    CreateDownloadFile
>;

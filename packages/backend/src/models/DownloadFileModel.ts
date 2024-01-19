import {
    DownloadFile,
    DownloadFileType,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DownloadFileTableName } from '../database/entities/downloadFile';

type Dependencies = {
    database: Knex;
};
export class DownloadFileModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async createDownloadFile(
        nanoid: string,
        path: string,
        type: DownloadFileType,
    ): Promise<void> {
        await this.database(DownloadFileTableName).insert({
            nanoid,
            path,
            type,
        });
    }

    async getDownloadFile(nanoid: string): Promise<DownloadFile> {
        const row = await this.database(DownloadFileTableName)
            .where('nanoid', nanoid)
            .select('*')
            .first();

        if (row === undefined) {
            throw new NotFoundError(`Cannot find file`);
        }

        return {
            nanoid: row.nanoid,
            path: row.path,
            createdAt: row.created_at,
            type: row.type as DownloadFileType,
        };
    }
}

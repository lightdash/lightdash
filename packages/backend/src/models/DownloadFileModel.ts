import {
    DownloadFile,
    DownloadFileType,
    NotFoundError,
    ResultRow,
    UnexpectedServerError,
} from '@lightdash/common';
import * as fs from 'fs';
import { Knex } from 'knex';
import { DownloadFileTableName } from '../database/entities/downloadFile';

type DownloadFileModelArguments = {
    database: Knex;
};
export class DownloadFileModel {
    private database: Knex;

    constructor(args: DownloadFileModelArguments) {
        this.database = args.database;
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

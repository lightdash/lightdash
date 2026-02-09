import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbPersistentDownloadFile,
    PersistentDownloadFileTableName,
} from '../database/entities/persistentDownloadFile';

type PersistentDownloadFileModelArguments = {
    database: Knex;
};

export class PersistentDownloadFileModel {
    private database: Knex;

    constructor(args: PersistentDownloadFileModelArguments) {
        this.database = args.database;
    }

    async create(data: {
        nanoid: string;
        s3Key: string;
        fileType: string;
        organizationUuid: string;
        projectUuid: string | null;
        createdByUserUuid: string | null;
    }): Promise<void> {
        await this.database(PersistentDownloadFileTableName).insert({
            nanoid: data.nanoid,
            s3_key: data.s3Key,
            file_type: data.fileType,
            organization_uuid: data.organizationUuid,
            project_uuid: data.projectUuid,
            created_by_user_uuid: data.createdByUserUuid,
        });
    }

    async get(nanoid: string): Promise<DbPersistentDownloadFile> {
        const row = await this.database(PersistentDownloadFileTableName)
            .where('nanoid', nanoid)
            .select('*')
            .first();

        if (row === undefined) {
            throw new NotFoundError('Cannot find file');
        }

        return row;
    }
}

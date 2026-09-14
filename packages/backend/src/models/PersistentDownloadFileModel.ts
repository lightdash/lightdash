import {
    NotFoundError,
    type PersistentDownloadFileAccessMode,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    PersistentDownloadFileTableName,
    type DbPersistentDownloadFile,
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
        accessMode: PersistentDownloadFileAccessMode;
        expiresAt: Date;
    }): Promise<void> {
        await this.database(PersistentDownloadFileTableName).insert({
            nanoid: data.nanoid,
            s3_key: data.s3Key,
            file_type: data.fileType,
            organization_uuid: data.organizationUuid,
            project_uuid: data.projectUuid,
            created_by_user_uuid: data.createdByUserUuid,
            access_mode: data.accessMode,
            expires_at: data.expiresAt,
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

    async delete(nanoid: string): Promise<void> {
        await this.database(PersistentDownloadFileTableName)
            .where('nanoid', nanoid)
            .delete();
    }
}

import { Knex } from 'knex';
import { DownloadAuditTableName } from '../database/entities/downloadAudit';

type DownloadAuditModelArguments = {
    database: Knex;
};

type LogDownloadParams = {
    queryUuid: string;
    userUuid: string | null;
    organizationUuid: string;
    projectUuid: string | null;
    fileType: string;
    originalQueryContext: string | null;
};

export class DownloadAuditModel {
    private database: Knex;

    constructor(args: DownloadAuditModelArguments) {
        this.database = args.database;
    }

    async logDownload({
        queryUuid,
        userUuid,
        organizationUuid,
        projectUuid,
        fileType,
        originalQueryContext,
    }: LogDownloadParams): Promise<void> {
        await this.database(DownloadAuditTableName).insert({
            query_uuid: queryUuid,
            user_uuid: userUuid,
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            file_type: fileType,
            original_query_context: originalQueryContext,
        });
    }
}

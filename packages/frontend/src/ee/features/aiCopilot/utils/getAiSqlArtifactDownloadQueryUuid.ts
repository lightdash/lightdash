import { Limit } from '../../../../components/ExportResults/types';
import { executeSqlDownloadQuery } from '../../../../features/sqlRunner/utils/executeSqlDownloadQuery';

type GetAiSqlArtifactDownloadQueryUuidArgs = {
    projectUuid: string;
    queryUuid: string;
    sql: string;
    limit: number | null;
    limitType: Limit;
};

export const getAiSqlArtifactDownloadQueryUuid = async ({
    projectUuid,
    queryUuid,
    sql,
    limit,
    limitType,
}: GetAiSqlArtifactDownloadQueryUuidArgs): Promise<string> => {
    if (limitType === Limit.TABLE) return queryUuid;

    return executeSqlDownloadQuery({
        projectUuid,
        sql,
        limit,
    });
};

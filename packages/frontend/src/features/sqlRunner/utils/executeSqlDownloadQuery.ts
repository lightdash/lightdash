import { MAX_SAFE_INTEGER, type ParametersValuesMap } from '@lightdash/common';
import { executeSqlQuery } from '../../queryRunner/executeQuery';

type ExecuteSqlDownloadQueryArgs = {
    projectUuid: string;
    sql: string;
    limit: number | null;
    parameterValues?: ParametersValuesMap;
    connectionUuid?: string;
};

export const executeSqlDownloadQuery = async ({
    projectUuid,
    sql,
    limit,
    parameterValues,
    connectionUuid,
}: ExecuteSqlDownloadQueryArgs): Promise<string> => {
    const result = await executeSqlQuery(
        projectUuid,
        sql,
        limit ?? MAX_SAFE_INTEGER,
        parameterValues,
        true,
        connectionUuid,
    );

    return result.queryUuid;
};

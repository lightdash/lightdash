import { MAX_SAFE_INTEGER, type ParametersValuesMap } from '@lightdash/common';
import { executeSqlQuery } from '../../queryRunner/executeQuery';

type ExecuteSqlDownloadQueryArgs = {
    projectUuid: string;
    sql: string;
    limit: number | null;
    parameterValues?: ParametersValuesMap;
};

export const executeSqlDownloadQuery = async ({
    projectUuid,
    sql,
    limit,
    parameterValues,
}: ExecuteSqlDownloadQueryArgs): Promise<string> => {
    const result = await executeSqlQuery(
        projectUuid,
        sql,
        limit ?? MAX_SAFE_INTEGER,
        parameterValues,
        true,
    );

    return result.queryUuid;
};

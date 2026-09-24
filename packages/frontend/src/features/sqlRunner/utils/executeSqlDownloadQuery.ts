import { MAX_SAFE_INTEGER, type ParametersValuesMap } from '@lightdash/common';
import { executeSqlQuery } from '../../queryRunner/executeQuery';

type ExecuteSqlDownloadQueryArgs = {
    projectUuid: string;
    sql: string;
    limit: number | null;
    parameterValues?: ParametersValuesMap;
    warehouseConnectionUuid: string | null | undefined;
};

export const executeSqlDownloadQuery = async ({
    projectUuid,
    sql,
    limit,
    parameterValues,
    warehouseConnectionUuid,
}: ExecuteSqlDownloadQueryArgs): Promise<string> => {
    const result = await executeSqlQuery(
        projectUuid,
        sql,
        limit ?? MAX_SAFE_INTEGER,
        parameterValues,
        true,
        warehouseConnectionUuid,
    );

    return result.queryUuid;
};

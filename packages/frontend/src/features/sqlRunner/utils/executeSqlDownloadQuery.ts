import { MAX_SAFE_INTEGER, type ParametersValuesMap } from '@lightdash/common';
import { type LightdashApi } from '../../../api';
import { executeSqlQuery } from '../../queryRunner/executeQuery';

type ExecuteSqlDownloadQueryArgs = {
    projectUuid: string;
    sql: string;
    limit: number | null;
    parameterValues?: ParametersValuesMap;
    warehouseConnectionUuid: string | null | undefined;
};

export const executeSqlDownloadQuery = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        sql,
        limit,
        parameterValues,
        warehouseConnectionUuid,
    }: ExecuteSqlDownloadQueryArgs,
): Promise<string> => {
    const result = await executeSqlQuery(
        lightdashApi,
        projectUuid,
        sql,
        limit ?? MAX_SAFE_INTEGER,
        parameterValues,
        true,
        warehouseConnectionUuid,
    );

    return result.queryUuid;
};

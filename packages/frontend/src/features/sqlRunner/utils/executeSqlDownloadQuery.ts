import {
    MAX_SAFE_INTEGER,
    type ParametersValuesMap,
    type PivotConfiguration,
} from '@lightdash/common';
import { executeSqlQuery } from './executeSqlQuery';

type ExecuteSqlDownloadQueryArgs = {
    projectUuid: string;
    sql: string;
    limit: number | null;
    parameterValues?: ParametersValuesMap;
    warehouseConnectionUuid: string | null | undefined;
    /** Set to export the rows as the chart pivots them. */
    pivotConfiguration?: PivotConfiguration;
};

export const executeSqlDownloadQuery = async ({
    projectUuid,
    sql,
    limit,
    parameterValues,
    warehouseConnectionUuid,
    pivotConfiguration,
}: ExecuteSqlDownloadQueryArgs): Promise<string> => {
    const result = await executeSqlQuery(
        projectUuid,
        sql,
        limit ?? MAX_SAFE_INTEGER,
        parameterValues,
        true,
        warehouseConnectionUuid,
        ...(pivotConfiguration ? [{ pivotConfiguration }] : []),
    );

    return result.queryUuid;
};

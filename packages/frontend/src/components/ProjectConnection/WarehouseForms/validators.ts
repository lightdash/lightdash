import { WarehouseTypes } from '@lightdash/common';
import {
    everyValidator,
    hasNoWhiteSpaces,
    isUppercase,
    startWithHTTPSProtocol,
} from '../../../utils/fieldValidators';

type Validator = (value: string) => string | undefined;

export const warehouseValueValidators: Record<
    WarehouseTypes,
    Record<string, Validator>
> = {
    [WarehouseTypes.BIGQUERY]: {
        dataset: hasNoWhiteSpaces('Data set'),
        project: hasNoWhiteSpaces('Project'),
        location: hasNoWhiteSpaces('Location'),
        executionProject: hasNoWhiteSpaces('Execution project'),
    },
    [WarehouseTypes.DATABRICKS]: {
        database: hasNoWhiteSpaces('Schema'),
        serverHostName: hasNoWhiteSpaces('Server host name'),
        httpPath: hasNoWhiteSpaces('HTTP Path'),
        catalog: hasNoWhiteSpaces('Catalog name'),
    },
    [WarehouseTypes.POSTGRES]: {
        schema: hasNoWhiteSpaces('Schema'),
        host: hasNoWhiteSpaces('Host'),
        user: hasNoWhiteSpaces('User'),
        dbname: hasNoWhiteSpaces('Database name'),
    },
    [WarehouseTypes.REDSHIFT]: {
        schema: hasNoWhiteSpaces('Schema'),
        host: hasNoWhiteSpaces('Host'),
        user: hasNoWhiteSpaces('User'),
        dbname: hasNoWhiteSpaces('Database name'),
    },
    [WarehouseTypes.SNOWFLAKE]: {
        schema: hasNoWhiteSpaces('Schema'),
        account: hasNoWhiteSpaces('Account'),
        user: hasNoWhiteSpaces('User'),
        role: hasNoWhiteSpaces('Role'),
        database: everyValidator('Database', isUppercase, hasNoWhiteSpaces),
        warehouse: everyValidator('Warehouse', isUppercase, hasNoWhiteSpaces),
        accessUrl: everyValidator(
            'Access URL',
            hasNoWhiteSpaces,
            startWithHTTPSProtocol,
        ),
    },
    [WarehouseTypes.TRINO]: {
        schema: hasNoWhiteSpaces('Schema'),
        host: hasNoWhiteSpaces('Host'),
        user: hasNoWhiteSpaces('User'),
        dbname: hasNoWhiteSpaces('Database name'),
    },
    [WarehouseTypes.CLICKHOUSE]: {
        schema: hasNoWhiteSpaces('Schema'),
        host: hasNoWhiteSpaces('Host'),
        user: hasNoWhiteSpaces('User'),
    },
} as const;

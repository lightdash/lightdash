import {
    AthenaAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import {
    everyValidator,
    hasNoWhiteSpaces,
    isRequired,
    isUppercase,
    startWithHTTPSProtocol,
    type FieldValidator,
} from '../../../utils/fieldValidators';
import { type ProjectConnectionForm } from '../types';

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
    [WarehouseTypes.ATHENA]: {
        region: hasNoWhiteSpaces('Region'),
        database: hasNoWhiteSpaces('Catalog'),
        schema: hasNoWhiteSpaces('Database'),
        s3StagingDir: hasNoWhiteSpaces('S3 Staging Directory'),
    },
    [WarehouseTypes.DUCKDB]: {
        database: hasNoWhiteSpaces('Database'),
        schema: hasNoWhiteSpaces('Schema'),
        token: hasNoWhiteSpaces('Service token'),
    },
} as const;

type CreateValidator = (
    value: string,
    values: ProjectConnectionForm,
) => string | undefined;

const required = (
    fieldName: string,
    ...validators: FieldValidator<string>[]
): CreateValidator => everyValidator(fieldName, isRequired, ...validators);

const requiredWhen =
    (
        fieldName: string,
        predicate: (values: ProjectConnectionForm) => boolean,
        ...validators: FieldValidator<string>[]
    ): CreateValidator =>
    (value, values) =>
        everyValidator(
            fieldName,
            ...(predicate(values) ? [isRequired, ...validators] : validators),
        )(value);

const snowflakeAuthIs =
    (...types: SnowflakeAuthenticationType[]) =>
    (values: ProjectConnectionForm) =>
        values.warehouse.type === WarehouseTypes.SNOWFLAKE &&
        values.warehouse.authenticationType !== undefined &&
        types.includes(values.warehouse.authenticationType);

const databricksAuthIs =
    (...types: DatabricksAuthenticationType[]) =>
    (values: ProjectConnectionForm) =>
        values.warehouse.type === WarehouseTypes.DATABRICKS &&
        values.warehouse.authenticationType !== undefined &&
        types.includes(values.warehouse.authenticationType);

const athenaAuthIs =
    (...types: AthenaAuthenticationType[]) =>
    (values: ProjectConnectionForm) =>
        values.warehouse.type === WarehouseTypes.ATHENA &&
        values.warehouse.authenticationType !== undefined &&
        types.includes(values.warehouse.authenticationType);

const isMotherduck = (values: ProjectConnectionForm) =>
    values.warehouse.type === WarehouseTypes.DUCKDB &&
    values.warehouse.connectionType === DuckdbConnectionType.MOTHERDUCK;

export const createWarehouseValueValidators: Record<
    WarehouseTypes,
    Record<string, CreateValidator>
> = {
    [WarehouseTypes.BIGQUERY]: {
        dataset: required('Data set', hasNoWhiteSpaces),
        project: required('Project', hasNoWhiteSpaces),
        location: hasNoWhiteSpaces('Location'),
        executionProject: hasNoWhiteSpaces('Execution project'),
    },
    [WarehouseTypes.DATABRICKS]: {
        database: required('Schema', hasNoWhiteSpaces),
        serverHostName: required('Server host name', hasNoWhiteSpaces),
        httpPath: required('HTTP Path', hasNoWhiteSpaces),
        catalog: required('Catalog name', hasNoWhiteSpaces),
        personalAccessToken: requiredWhen(
            'Personal access token',
            databricksAuthIs(
                DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
            ),
        ),
        oauthClientId: requiredWhen(
            'OAuth Client ID',
            databricksAuthIs(DatabricksAuthenticationType.OAUTH_M2M),
        ),
        oauthClientSecret: requiredWhen(
            'OAuth Client Secret',
            databricksAuthIs(DatabricksAuthenticationType.OAUTH_M2M),
        ),
    },
    [WarehouseTypes.POSTGRES]: {
        schema: required('Schema', hasNoWhiteSpaces),
        host: required('Host', hasNoWhiteSpaces),
        user: required('User', hasNoWhiteSpaces),
        password: required('Password'),
        dbname: required('Database name', hasNoWhiteSpaces),
    },
    [WarehouseTypes.REDSHIFT]: {
        schema: required('Schema', hasNoWhiteSpaces),
        host: required('Host', hasNoWhiteSpaces),
        user: required('User', hasNoWhiteSpaces),
        password: required('Password'),
        dbname: required('Database name', hasNoWhiteSpaces),
    },
    [WarehouseTypes.SNOWFLAKE]: {
        schema: required('Schema', hasNoWhiteSpaces),
        account: required('Account', hasNoWhiteSpaces),
        user: requiredWhen(
            'User',
            snowflakeAuthIs(
                SnowflakeAuthenticationType.PASSWORD,
                SnowflakeAuthenticationType.PRIVATE_KEY,
            ),
            hasNoWhiteSpaces,
        ),
        role: hasNoWhiteSpaces('Role'),
        password: requiredWhen(
            'Password',
            snowflakeAuthIs(SnowflakeAuthenticationType.PASSWORD),
        ),
        privateKey: requiredWhen(
            'Private key',
            snowflakeAuthIs(SnowflakeAuthenticationType.PRIVATE_KEY),
        ),
        database: required('Database', isUppercase, hasNoWhiteSpaces),
        warehouse: required('Warehouse', isUppercase, hasNoWhiteSpaces),
        accessUrl: everyValidator(
            'Access URL',
            hasNoWhiteSpaces,
            startWithHTTPSProtocol,
        ),
    },
    [WarehouseTypes.TRINO]: {
        schema: required('Schema', hasNoWhiteSpaces),
        host: required('Host', hasNoWhiteSpaces),
        user: required('User', hasNoWhiteSpaces),
        password: required('Password'),
        dbname: required('Database name', hasNoWhiteSpaces),
    },
    [WarehouseTypes.CLICKHOUSE]: {
        schema: required('Schema', hasNoWhiteSpaces),
        host: required('Host', hasNoWhiteSpaces),
        user: required('User', hasNoWhiteSpaces),
        password: required('Password'),
    },
    [WarehouseTypes.ATHENA]: {
        region: required('Region', hasNoWhiteSpaces),
        database: required('Catalog', hasNoWhiteSpaces),
        schema: required('Database', hasNoWhiteSpaces),
        s3StagingDir: required('S3 Staging Directory', hasNoWhiteSpaces),
        accessKeyId: requiredWhen(
            'AWS Access Key ID',
            athenaAuthIs(AthenaAuthenticationType.ACCESS_KEY),
        ),
        secretAccessKey: requiredWhen(
            'AWS Secret Access Key',
            athenaAuthIs(AthenaAuthenticationType.ACCESS_KEY),
        ),
    },
    [WarehouseTypes.DUCKDB]: {
        database: requiredWhen('Database', isMotherduck, hasNoWhiteSpaces),
        schema: required('Schema', hasNoWhiteSpaces),
        token: hasNoWhiteSpaces('Service token'),
    },
} as const;

export const shouldOpenPersonalSignInModal = ({
    errorName,
    personalSignInExpired,
    requireUserCredentials,
    warehouseType,
    alreadyOpened,
    pending,
}: {
    errorName: string;
    personalSignInExpired: boolean;
    requireUserCredentials: boolean;
    warehouseType: string;
    alreadyOpened: boolean;
    pending: boolean;
}): boolean => {
    if (alreadyOpened || pending) return false;
    if (errorName === 'MissingWarehouseCredentialsError') {
        return requireUserCredentials;
    }
    const tokenErrorWarehouse: Record<string, string> = {
        BigqueryTokenError: 'bigquery',
        SnowflakeTokenError: 'snowflake',
        DatabricksTokenError: 'databricks',
        RedshiftIamTokenError: 'redshift',
    };
    return (
        tokenErrorWarehouse[errorName] === warehouseType &&
        (personalSignInExpired || requireUserCredentials)
    );
};

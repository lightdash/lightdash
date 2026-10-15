import {
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

export const shouldTestExtraCredentials = (
    credentials: CreateWarehouseCredentials,
): boolean => {
    if (credentials.type !== WarehouseTypes.SNOWFLAKE) return true;
    if (
        credentials.authenticationType ===
        SnowflakeAuthenticationType.EXTERNAL_BROWSER
    ) {
        throw new ParameterError(
            'External browser authentication is not supported for an extra Snowflake connection.',
        );
    }
    if (credentials.authenticationType === SnowflakeAuthenticationType.NONE) {
        if (!credentials.requireUserCredentials) {
            throw new ParameterError(
                'A Snowflake connection without shared credentials requires users to provide their own credentials on the original connection.',
            );
        }
        return false;
    }
    return true;
};

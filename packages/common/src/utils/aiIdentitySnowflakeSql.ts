import { ParameterError } from '../types/errors';

export const aiIdentitySnowflakeIdentifier = (value: string): string => {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
        throw new ParameterError(
            'Snowflake names must use letters, digits, _ and $.',
        );
    }
    return value;
};

export const aiIdentitySnowflakeString = (value: string): string =>
    `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

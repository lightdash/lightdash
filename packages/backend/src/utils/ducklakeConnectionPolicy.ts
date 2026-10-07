import {
    DuckdbConnectionType,
    ParameterError,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

export const assertDucklakeConnectionAllowed = (
    credentials: CreateWarehouseCredentials,
    allowMultiOrgs: boolean,
): void => {
    if (
        allowMultiOrgs &&
        credentials.type === WarehouseTypes.DUCKDB &&
        credentials.connectionType === DuckdbConnectionType.DUCKLAKE
    ) {
        throw new ParameterError(
            'DuckLake connections are not supported on multi-organization instances',
        );
    }
};

export enum WarehouseConnectionFailureCause {
    CREDENTIALS = 'credentials',
    NETWORK = 'network',
    TIMEOUT = 'timeout',
    TLS = 'tls',
    MISSING_GRANT_OR_OBJECT = 'missing_grant_or_object',
    INPUT_FORMAT = 'input_format',
    OTHER = 'other',
}

export type WarehouseConnectionFailure = {
    cause: WarehouseConnectionFailureCause;
    driverCode: string | null;
};

export type WarehouseDriverErrorData = {
    driverCode: string | null;
};

export const getWarehouseDriverCode = (error: unknown): string | null => {
    if (typeof error !== 'object' || error === null) return null;
    if (
        'data' in error &&
        typeof error.data === 'object' &&
        error.data !== null &&
        'driverCode' in error.data &&
        typeof error.data.driverCode === 'string'
    ) {
        return error.data.driverCode;
    }
    if (
        'code' in error &&
        (typeof error.code === 'string' || typeof error.code === 'number')
    ) {
        return String(error.code);
    }
    return null;
};

export const toWarehouseDriverErrorData = (
    error: unknown,
): WarehouseDriverErrorData => ({
    driverCode: getWarehouseDriverCode(error),
});

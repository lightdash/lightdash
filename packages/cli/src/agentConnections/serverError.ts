export class ConnectionServerError extends Error {
    constructor(
        message: string,
        readonly statusCode?: number,
        readonly isLegacyDbtModelNamesValidationError = false,
    ) {
        super(message);
    }
}

export const isLegacyDbtModelNamesValidationResponse = (
    status: number,
    error: unknown,
): boolean => {
    if (
        status !== 422 ||
        typeof error !== 'object' ||
        error === null ||
        !('name' in error) ||
        error.name !== 'ValidateError' ||
        !('statusCode' in error) ||
        error.statusCode !== 422 ||
        !('data' in error) ||
        typeof error.data !== 'object' ||
        error.data === null ||
        Object.keys(error.data).length !== 1 ||
        !('body.dbtModelNames' in error.data)
    )
        return false;
    const field: unknown = error.data['body.dbtModelNames'];
    return (
        typeof field === 'object' &&
        field !== null &&
        'message' in field &&
        field.message === "'dbtModelNames' is required" &&
        (!('value' in field) || field.value === undefined) &&
        Object.keys(field).every((key) => key === 'message' || key === 'value')
    );
};

export const connectionServerError = (
    status: number,
    value: unknown,
): ConnectionServerError => {
    let identifier: string | null = null;
    let legacyDbtModelNamesValidation = false;
    if (typeof value === 'object' && value !== null && 'error' in value) {
        const { error } = value;
        if (typeof error === 'object' && error !== null) {
            legacyDbtModelNamesValidation =
                'status' in value &&
                value.status === 'error' &&
                isLegacyDbtModelNamesValidationResponse(status, error);
            let code: unknown = null;
            if ('code' in error) code = error.code;
            else if ('name' in error) code = error.name;
            if (typeof code === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(code))
                identifier = code;
        }
    }
    switch (identifier) {
        case 'agent_connections_unavailable':
            return new ConnectionServerError(
                'Agent connections are not available on this server yet.',
                status,
            );
        case 'agent_identity_disabled':
            return new ConnectionServerError(
                'Agent connections are disabled on this server. Ask an administrator to enable agent identity.',
                status,
            );
        default:
            return new ConnectionServerError(
                `The server rejected the agent connection request (status ${status}).`,
                status,
                legacyDbtModelNamesValidation,
            );
    }
};

export const checkConnectionErrorEnvelope = (
    status: number,
    value: unknown,
): void => {
    if (
        typeof value === 'object' &&
        value !== null &&
        'status' in value &&
        value.status === 'error'
    )
        throw connectionServerError(status, value);
};

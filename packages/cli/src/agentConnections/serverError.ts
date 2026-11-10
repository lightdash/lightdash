export class ConnectionServerError extends Error {}

export const connectionServerError = (
    status: number,
    value: unknown,
): ConnectionServerError => {
    let identifier: string | null = null;
    if (typeof value === 'object' && value !== null && 'error' in value) {
        const { error } = value;
        if (typeof error === 'object' && error !== null) {
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
            );
        case 'agent_identity_disabled':
            return new ConnectionServerError(
                'Agent connections are disabled on this server. Ask an administrator to enable agent identity.',
            );
        default:
            return new ConnectionServerError(
                `The server rejected the agent connection request (status ${status}).`,
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

import { isApiError } from '@lightdash/common'; // pragma: allowlist secret

export const isMissingSyncStatus = (error: unknown): boolean => {
    if (!isApiError(error)) {
        return true;
    }

    return (
        error.error.statusCode === 404 || error.error.name === 'NetworkError'
    );
};

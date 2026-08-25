import { isApiError, type AnyType } from '@lightdash/common'; // pragma: allowlist secret
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import {
    EMPTY_CONTENT_AS_CODE_SYNC_STATUS,
    type ContentAsCodeSyncStatus,
} from '../types';

const isMissingSyncStatus = (error: unknown): boolean => {
    if (!isApiError(error)) {
        return true;
    }

    return (
        error.error.statusCode === 404 || error.error.name === 'NetworkError'
    );
};

export const getContentAsCodeSyncStatus = async (
    projectUuid: string,
): Promise<ContentAsCodeSyncStatus> => {
    try {
        return (await api<AnyType>({
            url: `/projects/${projectUuid}/code/sync-status`,
            method: 'GET',
            body: undefined,
        })) as ContentAsCodeSyncStatus;
    } catch (error) {
        // Missing endpoint or a network miss is treated as "not yet synced".
        if (isMissingSyncStatus(error)) {
            return EMPTY_CONTENT_AS_CODE_SYNC_STATUS;
        }

        throw error;
    }
};

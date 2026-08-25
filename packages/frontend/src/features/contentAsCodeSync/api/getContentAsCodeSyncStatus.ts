import { type AnyType } from '@lightdash/common'; // pragma: allowlist secret
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import {
    type ContentAsCodeSyncStatus,
    type ContentAsCodeSyncStatusResult,
} from '../types';
import { isMissingSyncStatus } from './isMissingSyncStatus';

export const getContentAsCodeSyncStatus = async (
    projectUuid: string,
): Promise<ContentAsCodeSyncStatusResult> => {
    try {
        const status = (await api<AnyType>({
            url: `/projects/${projectUuid}/code/sync-status`,
            method: 'GET',
            body: undefined,
        })) as ContentAsCodeSyncStatus;

        return { kind: 'ok', status };
    } catch (error) {
        if (isMissingSyncStatus(error)) {
            return { kind: 'unavailable' };
        }

        throw error;
    }
};

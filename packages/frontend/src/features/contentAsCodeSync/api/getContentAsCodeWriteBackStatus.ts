import { type AnyType } from '@lightdash/common'; // pragma: allowlist secret
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import {
    type ContentAsCodeSyncContentType,
    type ContentAsCodeWriteBackStatus,
    type ContentAsCodeWriteBackStatusResult,
} from '../types';
import { isMissingSyncStatus } from './isMissingSyncStatus';

export const getContentAsCodeWriteBackStatus = async (
    projectUuid: string,
    contentType: ContentAsCodeSyncContentType,
    slug: string,
): Promise<ContentAsCodeWriteBackStatusResult> => {
    try {
        const status = (await api<AnyType>({
            url: `/projects/${projectUuid}/code/write-back-status?${new URLSearchParams(
                { contentType, slug },
            ).toString()}`,
            method: 'GET',
            body: undefined,
        })) as ContentAsCodeWriteBackStatus;

        return { kind: 'ok', status };
    } catch (error) {
        if (isMissingSyncStatus(error)) {
            return { kind: 'unavailable' };
        }

        throw error;
    }
};

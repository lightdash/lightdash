import { type AnyType } from '@lightdash/common'; // pragma: allowlist secret
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import {
    type ContentAsCodeSyncContentType,
    type ContentAsCodeSyncStatus,
} from '../types';

export type RestampContentAsCodeRevisionArgs = {
    projectUuid: string;
    contentType: ContentAsCodeSyncContentType;
    slug: string;
};

export const restampContentAsCodeRevision = async ({
    projectUuid,
    contentType,
    slug,
}: RestampContentAsCodeRevisionArgs): Promise<ContentAsCodeSyncStatus> =>
    (await api<AnyType>({
        url: `/projects/${projectUuid}/code/applied-revisions/restamp`,
        method: 'POST',
        body: JSON.stringify({ contentType, slug }),
    })) as ContentAsCodeSyncStatus;

import { type AnyType } from '@lightdash/common'; // pragma: allowlist secret
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import {
    type ContentAsCodeProposeResult,
    type ContentAsCodeSyncContentType,
} from '../types';

export const proposeContentAsCode = async (
    projectUuid: string,
    contentType: ContentAsCodeSyncContentType,
    slug: string,
): Promise<ContentAsCodeProposeResult> =>
    (await api<AnyType>({
        url: `/projects/${projectUuid}/code/propose`,
        method: 'POST',
        body: JSON.stringify({ contentType, slug }),
    })) as ContentAsCodeProposeResult;

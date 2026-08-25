import { type ApiError } from '@lightdash/common'; // pragma: allowlist secret
import { useQuery } from '@tanstack/react-query';
import { getContentAsCodeWriteBackStatus } from '../api/getContentAsCodeWriteBackStatus';
import {
    CONTENT_AS_CODE_WRITE_BACK_STATUS_QUERY_KEY,
    type ContentAsCodeSyncContentType,
    type ContentAsCodeWriteBackStatusResult,
} from '../types';

export const useContentAsCodeWriteBackStatus = (
    projectUuid: string,
    contentType: ContentAsCodeSyncContentType,
    slug: string,
    enabled: boolean,
) =>
    useQuery<ContentAsCodeWriteBackStatusResult, ApiError>({
        queryKey: [
            CONTENT_AS_CODE_WRITE_BACK_STATUS_QUERY_KEY,
            projectUuid,
            contentType,
            slug,
        ],
        queryFn: () =>
            getContentAsCodeWriteBackStatus(projectUuid, contentType, slug),
        enabled,
    });

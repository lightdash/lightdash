import {
    type ApiAppImageUploadUrlResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type UploadUrlParams = {
    projectUuid: string;
    mimeType: string;
    appUuid?: string;
};

type UploadUrlResult = ApiAppImageUploadUrlResponse['results'];

const getUploadUrl = async ({
    projectUuid,
    mimeType,
    appUuid,
}: UploadUrlParams): Promise<UploadUrlResult> => {
    const data = await lightdashApi<UploadUrlResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/upload-url`,
        body: JSON.stringify({ mimeType, appUuid }),
    });
    return data;
};

export const useAppImageUploadUrl = () =>
    useMutation<UploadUrlResult, ApiError, UploadUrlParams>({
        mutationFn: getUploadUrl,
    });

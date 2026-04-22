import {
    type ApiAppImageUploadResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';

type UploadImageParams = {
    projectUuid: string;
    file: File;
    appUuid: string;
};

type UploadImageResult = ApiAppImageUploadResponse['results'];

const uploadImage = async ({
    projectUuid,
    file,
    appUuid,
}: UploadImageParams): Promise<UploadImageResult> => {
    const response = await fetch(
        `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/upload-image`,
        {
            method: 'POST',
            body: file,
            headers: { 'Content-Type': file.type },
        },
    );
    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(
            errorBody?.error?.message ?? `Upload failed: ${response.status}`,
        );
    }
    const json = await response.json();
    return json.results;
};

export const useAppImageUpload = () =>
    useMutation<UploadImageResult, ApiError, UploadImageParams>({
        mutationFn: uploadImage,
    });

import {
    type ApiAppImageUploadResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';

type UploadImageParams = {
    projectUuid: string;
    file: File;
    appUuid: string;
    /** Marks the image as a screenshot of the current preview so the
     *  backend can label it for the agent. Optional — defaults to a
     *  regular design-reference attachment. */
    kind?: 'screenshot';
};

type UploadImageResult = ApiAppImageUploadResponse['results'];

const uploadImage = async ({
    projectUuid,
    file,
    appUuid,
    kind,
}: UploadImageParams): Promise<UploadImageResult> => {
    const url = `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/upload-image${
        kind ? `?kind=${kind}` : ''
    }`;
    const response = await fetch(url, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type },
    });
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

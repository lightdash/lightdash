import {
    type ApiAppFileUploadResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import {
    appApiBase,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';

type UploadFileParams = {
    projectUuid: string;
    file: File;
    appUuid: string;
    /** Marks the file as a screenshot of the current preview so the
     *  backend can label it for the agent. Optional — defaults to a
     *  regular attachment. */
    kind?: 'screenshot';
    owner: ChartTypeOwner;
};

type UploadFileResult = ApiAppFileUploadResponse['results'];

const uploadFile = async ({
    projectUuid,
    file,
    appUuid,
    kind,
    owner,
}: UploadFileParams): Promise<UploadFileResult> => {
    const params = new URLSearchParams();
    if (file.name) params.set('filename', file.name);
    if (kind) params.set('kind', kind);
    const query = params.toString();
    const url = `/api/v1${appApiBase(owner, projectUuid)}/${appUuid}/upload-file${
        query ? `?${query}` : ''
    }`;
    const response = await fetch(url, {
        method: 'POST',
        body: file,
        // Browsers leave File.type empty for extensions they don't know
        // (.twb, .yml, …) — the backend requires a Content-Type header and
        // classifies by content, so fall back to a generic binary type.
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!response.ok) {
        let message = `Upload failed: ${response.status}`;
        try {
            const errorBody = await response.json();
            message = errorBody?.error?.message ?? message;
        } catch {
            // non-JSON error body — keep the status-based message
        }
        throw new Error(message);
    }
    const json = await response.json();
    return json.results;
};

export const useAppFileUpload = () =>
    useMutation<UploadFileResult, ApiError, UploadFileParams>({
        mutationFn: uploadFile,
    });

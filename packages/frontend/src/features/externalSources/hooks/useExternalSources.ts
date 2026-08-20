import {
    ExternalSourceStatus,
    type ApiError,
    type CreateExternalSourceTablePayload,
    type ExternalSource,
    type StagedExternalSourceUpload,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const EXTERNAL_SOURCES_BASE = (projectUuid: string) =>
    `/ee/projects/${projectUuid}/external-sources`;

const getExternalSourceApi = async (projectUuid: string, sourceUuid: string) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(projectUuid)}/${sourceUuid}`,
        method: 'GET',
        body: undefined,
    });

// Raw body + filename in query params (matches the backend controller —
// mirrors the design-file upload precedent, NOT multipart/form-data).
const uploadCsvApi = async (args: { projectUuid: string; file: File }) => {
    const search = new URLSearchParams({ filename: args.file.name });
    return lightdashApi<StagedExternalSourceUpload>({
        url: `${EXTERNAL_SOURCES_BASE(
            args.projectUuid,
        )}/upload?${search.toString()}`,
        method: 'POST',
        body: args.file,
        headers: {
            'Content-Type': args.file.type || 'text/csv',
        },
    });
};

const commitUploadApi = async (args: {
    projectUuid: string;
    sourceUuid: string;
    payload: CreateExternalSourceTablePayload;
}) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${
            args.sourceUuid
        }/commit`,
        method: 'POST',
        body: JSON.stringify(args.payload),
    });

/**
 * Polls while the source is syncing; when it settles, the caller reacts to
 * the status change (e.g. invalidates the tables list and navigates).
 */
export const useExternalSource = (
    projectUuid: string | undefined,
    sourceUuid: string | undefined,
    options?: { poll?: boolean },
) =>
    useQuery<ExternalSource, ApiError>({
        queryKey: ['external-sources', projectUuid, sourceUuid],
        queryFn: () => getExternalSourceApi(projectUuid!, sourceUuid!),
        enabled: !!projectUuid && !!sourceUuid,
        refetchInterval: options?.poll
            ? (data) =>
                  data?.status === ExternalSourceStatus.SYNCING ? 2000 : false
            : false,
    });

export const useUploadCsv = (projectUuid: string | undefined) => {
    const { showToastApiError } = useToaster();
    return useMutation<StagedExternalSourceUpload, ApiError, File>({
        mutationFn: (file) => uploadCsvApi({ projectUuid: projectUuid!, file }),
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not upload the file',
                apiError: error,
            });
        },
    });
};

export const useCommitCsvUpload = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation<
        ExternalSource,
        ApiError,
        { sourceUuid: string; payload: CreateExternalSourceTablePayload }
    >({
        mutationFn: ({ sourceUuid, payload }) =>
            commitUploadApi({
                projectUuid: projectUuid!,
                sourceUuid,
                payload,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
        },
    });
};

/** Invalidate the explore lists after an ingest completes. */
export const useInvalidateTables = () => {
    const queryClient = useQueryClient();
    return (projectUuid: string) =>
        queryClient.invalidateQueries({
            queryKey: ['tables', projectUuid],
        });
};

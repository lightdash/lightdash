import {
    ExternalSourceStatus,
    type ApiError,
    type CreateExternalSourceTablePayload,
    type CreateGoogleSheetsSourcePayload,
    type ExternalSource,
    type ExternalSourceTablePreview,
    type StagedExternalSourceUpload,
    type UpdateExternalSourcePayload,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const EXTERNAL_SOURCES_BASE = (projectUuid: string) =>
    `/ee/projects/${projectUuid}/external-sources`;

const listExternalSourcesApi = async (projectUuid: string) =>
    lightdashApi<ExternalSource[]>({
        url: EXTERNAL_SOURCES_BASE(projectUuid),
        method: 'GET',
        body: undefined,
    });

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

export const useExternalSources = (projectUuid: string | undefined) =>
    useQuery<ExternalSource[], ApiError>({
        queryKey: ['external-sources', projectUuid],
        queryFn: () => listExternalSourcesApi(projectUuid!),
        enabled: !!projectUuid,
        refetchInterval: (data) =>
            data?.some(
                (source) => source.status === ExternalSourceStatus.SYNCING,
            )
                ? 2000
                : false,
    });

const createSheetsSourceApi = async (args: {
    projectUuid: string;
    payload: CreateGoogleSheetsSourcePayload;
}) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/google-sheets`,
        method: 'POST',
        body: JSON.stringify(args.payload),
    });

export const useCreateSheetsSource = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation<
        ExternalSource,
        ApiError,
        CreateGoogleSheetsSourcePayload
    >({
        mutationFn: (payload) =>
            createSheetsSourceApi({ projectUuid: projectUuid!, payload }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
        },
    });
};

const refreshExternalSourceApi = async (args: {
    projectUuid: string;
    sourceUuid: string;
}) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${
            args.sourceUuid
        }/refresh`,
        method: 'POST',
        body: undefined,
    });

export const useRefreshExternalSource = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalSource, ApiError, string>({
        mutationFn: (sourceUuid) =>
            refreshExternalSourceApi({
                projectUuid: projectUuid!,
                sourceUuid,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
            showToastSuccess({
                title: 'Refreshing from Google Sheets',
                subtitle: 'The table updates when the ingest finishes.',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not refresh the source',
                apiError: error,
            });
        },
    });
};

const reconnectExternalSourceApi = (args: {
    projectUuid: string;
    sourceUuid: string;
}) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${args.sourceUuid}/reconnect`,
        method: 'POST',
        body: undefined,
    });

export const useReconnectExternalSource = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalSource, ApiError, string>({
        mutationFn: (sourceUuid) =>
            reconnectExternalSourceApi({
                projectUuid: projectUuid!,
                sourceUuid,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
            showToastSuccess({
                title: 'Google Sheet reconnected',
                subtitle: 'The project now owns this connection.',
            });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Could not reconnect the source',
                apiError: error,
            }),
    });
};

const renameExternalSourceApi = async (args: {
    projectUuid: string;
    sourceUuid: string;
    payload: UpdateExternalSourcePayload;
}) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${args.sourceUuid}`,
        method: 'PATCH',
        body: JSON.stringify(args.payload),
    });

export const useRenameExternalSource = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ExternalSource,
        ApiError,
        { sourceUuid: string; payload: UpdateExternalSourcePayload }
    >({
        mutationFn: ({ sourceUuid, payload }) =>
            renameExternalSourceApi({
                projectUuid: projectUuid!,
                sourceUuid,
                payload,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
            await queryClient.invalidateQueries({
                queryKey: ['tables', projectUuid],
            });
            showToastSuccess({ title: 'Table renamed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not rename the table',
                apiError: error,
            });
        },
    });
};

const replaceCsvApi = async (args: {
    projectUuid: string;
    sourceUuid: string;
    file: File;
}) => {
    const search = new URLSearchParams({ filename: args.file.name });
    return lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${
            args.sourceUuid
        }/csv?${search.toString()}`,
        method: 'PUT',
        body: args.file,
        headers: {
            'Content-Type': args.file.type || 'text/csv',
        },
    });
};

export const useReplaceCsvFile = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ExternalSource,
        ApiError,
        { sourceUuid: string; file: File }
    >({
        mutationFn: ({ sourceUuid, file }) =>
            replaceCsvApi({ projectUuid: projectUuid!, sourceUuid, file }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not replace the file',
                apiError: error,
            });
        },
    });
};

const deleteExternalSourceApi = async (args: {
    projectUuid: string;
    sourceUuid: string;
}) =>
    lightdashApi<undefined>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${args.sourceUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteExternalSource = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>({
        mutationFn: (sourceUuid) =>
            deleteExternalSourceApi({
                projectUuid: projectUuid!,
                sourceUuid,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
            await queryClient.invalidateQueries({
                queryKey: ['tables', projectUuid],
            });
            showToastSuccess({ title: 'External source deleted' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not delete the external source',
                apiError: error,
            });
        },
    });
};

const getTablePreviewApi = async (args: {
    projectUuid: string;
    sourceUuid: string;
    tableUuid: string;
}) =>
    lightdashApi<ExternalSourceTablePreview>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${
            args.sourceUuid
        }/tables/${args.tableUuid}/preview`,
        method: 'GET',
        body: undefined,
    });

export const useExternalSourceTablePreview = (args: {
    projectUuid: string | undefined;
    sourceUuid: string | undefined;
    tableUuid: string | undefined;
}) =>
    useQuery<ExternalSourceTablePreview, ApiError>({
        queryKey: [
            'external-sources',
            args.projectUuid,
            args.sourceUuid,
            'preview',
            args.tableUuid,
        ],
        queryFn: () =>
            getTablePreviewApi({
                projectUuid: args.projectUuid!,
                sourceUuid: args.sourceUuid!,
                tableUuid: args.tableUuid!,
            }),
        enabled: !!args.projectUuid && !!args.sourceUuid && !!args.tableUuid,
    });

import {
    ExternalSourceStatus,
    ExternalSourceScope,
    type ApiError,
    type CreateExternalSourceTablePayload,
    type CreateGoogleSheetsSourcePayload,
    type ExternalSource,
    type ExternalSourceTablePreview,
    type StagedExternalSourceUpload,
    type UpdateExternalSourcePayload,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const EXTERNAL_SOURCES_BASE = (projectUuid: string) =>
    `/ee/projects/${projectUuid}/external-sources`;

const listExternalSourcesApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ExternalSource[]>({
        url: EXTERNAL_SOURCES_BASE(projectUuid),
        method: 'GET',
        body: undefined,
    });

export const getExternalSourceApi = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    sourceUuid: string,
) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(projectUuid)}/${sourceUuid}`,
        method: 'GET',
        body: undefined,
    });

// Raw body + filename in query params (matches the backend controller —
// mirrors the design-file upload precedent, NOT multipart/form-data).
const uploadCsvApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        file: File;
        scope: ExternalSourceScope;
    },
) => {
    const search = new URLSearchParams({
        filename: args.file.name,
        scope: args.scope,
    });
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

const commitUploadApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
        payload: CreateExternalSourceTablePayload;
    },
) =>
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalSource, ApiError>({
        queryKey: ['external-sources', projectUuid, sourceUuid],
        queryFn: () =>
            getExternalSourceApi(lightdashApi, projectUuid!, sourceUuid!),
        enabled: !!projectUuid && !!sourceUuid,
        refetchInterval: options?.poll
            ? (data) =>
                  data?.status === ExternalSourceStatus.SYNCING ? 2000 : false
            : false,
    });
};

export const useUploadCsv = (
    projectUuid: string | undefined,
    scope: ExternalSourceScope = ExternalSourceScope.CATALOG,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<StagedExternalSourceUpload, ApiError, File>({
        mutationFn: (file) =>
            uploadCsvApi(lightdashApi, {
                projectUuid: projectUuid!,
                file,
                scope,
            }),
        onError: ({ error }) => {
            showToastApiError({
                title: 'Could not upload the file',
                apiError: error,
            });
        },
    });
};

export const useCommitCsvUpload = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        ExternalSource,
        ApiError,
        { sourceUuid: string; payload: CreateExternalSourceTablePayload }
    >({
        mutationFn: ({ sourceUuid, payload }) =>
            commitUploadApi(lightdashApi, {
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

export const useExternalSources = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalSource[], ApiError>({
        queryKey: ['external-sources', projectUuid],
        queryFn: () => listExternalSourcesApi(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
        refetchInterval: (data) =>
            data?.some(
                (source) => source.status === ExternalSourceStatus.SYNCING,
            )
                ? 2000
                : false,
    });
};

const createSheetsSourceApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        payload: CreateGoogleSheetsSourcePayload;
    },
) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/google-sheets`,
        method: 'POST',
        body: JSON.stringify(args.payload),
    });

export const useCreateSheetsSource = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        ExternalSource,
        ApiError,
        CreateGoogleSheetsSourcePayload
    >({
        mutationFn: (payload) =>
            createSheetsSourceApi(lightdashApi, {
                projectUuid: projectUuid!,
                payload,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-sources', projectUuid],
            });
        },
    });
};

const refreshExternalSourceApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
    },
) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${
            args.sourceUuid
        }/refresh`,
        method: 'POST',
        body: undefined,
    });

export const useRefreshExternalSource = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalSource, ApiError, string>({
        mutationFn: (sourceUuid) =>
            refreshExternalSourceApi(lightdashApi, {
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

const reconnectExternalSourceApi = (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
    },
) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${args.sourceUuid}/reconnect`,
        method: 'POST',
        body: undefined,
    });

export const useReconnectExternalSource = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalSource, ApiError, string>({
        mutationFn: (sourceUuid) =>
            reconnectExternalSourceApi(lightdashApi, {
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

const renameExternalSourceApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
        payload: UpdateExternalSourcePayload;
    },
) =>
    lightdashApi<ExternalSource>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${args.sourceUuid}`,
        method: 'PATCH',
        body: JSON.stringify(args.payload),
    });

export const useRenameExternalSource = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ExternalSource,
        ApiError,
        { sourceUuid: string; payload: UpdateExternalSourcePayload }
    >({
        mutationFn: ({ sourceUuid, payload }) =>
            renameExternalSourceApi(lightdashApi, {
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

const replaceCsvApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
        file: File;
    },
) => {
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ExternalSource,
        ApiError,
        { sourceUuid: string; file: File }
    >({
        mutationFn: ({ sourceUuid, file }) =>
            replaceCsvApi(lightdashApi, {
                projectUuid: projectUuid!,
                sourceUuid,
                file,
            }),
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

export const deleteExternalSourceApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
    },
) =>
    lightdashApi<undefined>({
        url: `${EXTERNAL_SOURCES_BASE(args.projectUuid)}/${args.sourceUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteExternalSource = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>({
        mutationFn: (sourceUuid) =>
            deleteExternalSourceApi(lightdashApi, {
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

const getTablePreviewApi = async (
    lightdashApi: LightdashApi,
    args: {
        projectUuid: string;
        sourceUuid: string;
        tableUuid: string;
    },
) =>
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
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalSourceTablePreview, ApiError>({
        queryKey: [
            'external-sources',
            args.projectUuid,
            args.sourceUuid,
            'preview',
            args.tableUuid,
        ],
        queryFn: () =>
            getTablePreviewApi(lightdashApi, {
                projectUuid: args.projectUuid!,
                sourceUuid: args.sourceUuid!,
                tableUuid: args.tableUuid!,
            }),
        enabled: !!args.projectUuid && !!args.sourceUuid && !!args.tableUuid,
    });
};

import {
    type ApiError,
    type ApiOrganizationDesign,
    type ApiOrganizationDesignFile,
    type ApiOrganizationDesignFileResponse,
    type ApiOrganizationDesignResponse,
    type ApiOrganizationDesignsResponse,
    type CreateOrganizationDesignRequest,
    type OrganizationDesignFileKind,
    type UpdateOrganizationDesignRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const ORG_DESIGNS_QUERY_KEY = 'org_designs';
const ORG_DESIGN_QUERY_KEY = 'org_design';

const listOrganizationDesignsApi = async () =>
    lightdashApi<ApiOrganizationDesignsResponse['results']>({
        url: '/org/designs',
        method: 'GET',
        body: undefined,
    });

const getOrganizationDesignApi = async (designUuid: string) =>
    lightdashApi<ApiOrganizationDesignResponse['results']>({
        url: `/org/designs/${designUuid}`,
        method: 'GET',
        body: undefined,
    });

const createOrganizationDesignApi = async (
    data: CreateOrganizationDesignRequest,
) =>
    lightdashApi<ApiOrganizationDesignResponse['results']>({
        url: '/org/designs',
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateOrganizationDesignApi = async (
    designUuid: string,
    data: UpdateOrganizationDesignRequest,
) =>
    lightdashApi<ApiOrganizationDesignResponse['results']>({
        url: `/org/designs/${designUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteOrganizationDesignApi = async (designUuid: string) =>
    lightdashApi<null>({
        url: `/org/designs/${designUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const setDefaultOrganizationDesignApi = async (designUuid: string) =>
    lightdashApi<ApiOrganizationDesignResponse['results']>({
        url: `/org/designs/${designUuid}/default`,
        method: 'POST',
        body: undefined,
    });

// TODO(stage-3-followup): the backend currently has no endpoint for clearing
// the org default without setting another design as default. The FE wires
// this call so the UX is bidirectional; until the backend lands the
// `DELETE /api/v1/org/designs/default` route this will 404 and the user
// will see an error toast. Tracked as a Stage 1 follow-up.
const clearDefaultOrganizationDesignApi = async () =>
    lightdashApi<null>({
        url: '/org/designs/default',
        method: 'DELETE',
        body: undefined,
    });

// File upload uses raw body + query params (matches the backend controller —
// mirrors the appGenerate image-upload precedent, NOT multipart/form-data).
// Browsers auto-populate Content-Length from the Blob — don't set it
// manually (it's a forbidden header in fetch).
const uploadDesignFileApi = async (args: {
    designUuid: string;
    file: File;
    kind: OrganizationDesignFileKind;
    filename: string;
}) => {
    const search = new URLSearchParams({
        kind: args.kind,
        filename: args.filename,
    });
    return lightdashApi<ApiOrganizationDesignFileResponse['results']>({
        url: `/org/designs/${args.designUuid}/files?${search.toString()}`,
        method: 'POST',
        body: args.file,
        headers: {
            'Content-Type': args.file.type || 'application/octet-stream',
        },
    });
};

const deleteDesignFileApi = async (args: {
    designUuid: string;
    fileUuid: string;
}) =>
    lightdashApi<null>({
        url: `/org/designs/${args.designUuid}/files/${args.fileUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOrganizationDesigns = ({
    enabled = true,
}: { enabled?: boolean } = {}) =>
    useQuery<ApiOrganizationDesignsResponse['results'], ApiError>({
        enabled,
        queryKey: [ORG_DESIGNS_QUERY_KEY],
        queryFn: listOrganizationDesignsApi,
    });

export const useOrganizationDesign = (designUuid: string | undefined) =>
    useQuery<ApiOrganizationDesignResponse['results'], ApiError>({
        enabled: Boolean(designUuid),
        queryKey: [ORG_DESIGN_QUERY_KEY, designUuid],
        queryFn: () => getOrganizationDesignApi(designUuid as string),
    });

export const useCreateOrganizationDesign = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ApiOrganizationDesign,
        ApiError,
        CreateOrganizationDesignRequest
    >((data) => createOrganizationDesignApi(data), {
        mutationKey: ['create_org_design'],
        onSuccess: async () => {
            await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
            showToastSuccess({ title: 'Theme created successfully' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create theme',
                apiError: error,
            });
        },
    });
};

export const useUpdateOrganizationDesign = () => {
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ApiOrganizationDesign,
        ApiError,
        { designUuid: string; data: UpdateOrganizationDesignRequest }
    >(({ designUuid, data }) => updateOrganizationDesignApi(designUuid, data), {
        mutationKey: ['update_org_design'],
        onSuccess: async (_result, { designUuid }) => {
            await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
            await queryClient.invalidateQueries([
                ORG_DESIGN_QUERY_KEY,
                designUuid,
            ]);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update theme',
                apiError: error,
            });
        },
    });
};

export const useDeleteOrganizationDesign = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, string>(
        (designUuid) => deleteOrganizationDesignApi(designUuid),
        {
            mutationKey: ['delete_org_design'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
                showToastSuccess({ title: 'Theme deleted' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to delete theme',
                    apiError: error,
                });
            },
        },
    );
};

export const useSetDefaultOrganizationDesign = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<ApiOrganizationDesign, ApiError, string>(
        (designUuid) => setDefaultOrganizationDesignApi(designUuid),
        {
            mutationKey: ['set_default_org_design'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
                // Setting a default flips `isDefault` on two rows (the new
                // default goes up, the old default goes down). Invalidate
                // every single-design query so any open detail modal
                // refreshes.
                await queryClient.invalidateQueries([ORG_DESIGN_QUERY_KEY]);
                showToastSuccess({ title: 'Default theme updated' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to set default theme',
                    apiError: error,
                });
            },
        },
    );
};

export const useClearDefaultOrganizationDesign = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, void>(
        () => clearDefaultOrganizationDesignApi(),
        {
            mutationKey: ['clear_default_org_design'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
                // We don't know which design was the default — invalidate
                // every single-design query so any open detail modal sees
                // the cleared `isDefault`.
                await queryClient.invalidateQueries([ORG_DESIGN_QUERY_KEY]);
                showToastSuccess({ title: 'Default theme cleared' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to clear default theme',
                    apiError: error,
                });
            },
        },
    );
};

export const useUploadDesignFile = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        ApiOrganizationDesignFile,
        ApiError,
        {
            designUuid: string;
            file: File;
            kind: OrganizationDesignFileKind;
            filename: string;
        }
    >((args) => uploadDesignFileApi(args), {
        mutationKey: ['upload_org_design_file'],
        onSuccess: async (_result, { designUuid, filename }) => {
            await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
            await queryClient.invalidateQueries([
                ORG_DESIGN_QUERY_KEY,
                designUuid,
            ]);
            showToastSuccess({ title: `Uploaded ${filename}` });
        },
        onError: ({ error }, { filename }) => {
            showToastApiError({
                title: `Failed to upload ${filename}`,
                apiError: error,
            });
        },
    });
};

export const useDeleteDesignFile = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        null,
        ApiError,
        { designUuid: string; fileUuid: string }
    >((args) => deleteDesignFileApi(args), {
        mutationKey: ['delete_org_design_file'],
        onSuccess: async (_result, { designUuid }) => {
            await queryClient.invalidateQueries([ORG_DESIGNS_QUERY_KEY]);
            await queryClient.invalidateQueries([
                ORG_DESIGN_QUERY_KEY,
                designUuid,
            ]);
            showToastSuccess({ title: 'File deleted' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete file',
                apiError: error,
            });
        },
    });
};

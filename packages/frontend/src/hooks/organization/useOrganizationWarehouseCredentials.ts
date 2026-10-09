import {
    type ApiError,
    type CreateOrganizationWarehouseCredentials,
    type OrganizationWarehouseCredentials,
    type UpdateOrganizationWarehouseCredentials,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const getOrganizationWarehouseCredentials = async (
    lightdashApi: LightdashApi,
) =>
    lightdashApi<OrganizationWarehouseCredentials[]>({
        url: `/org/warehouse-credentials`,
        method: 'GET',
        body: undefined,
    });

const createOrganizationWarehouseCredentials = async (
    lightdashApi: LightdashApi,
    data: CreateOrganizationWarehouseCredentials,
) =>
    lightdashApi<OrganizationWarehouseCredentials>({
        url: `/org/warehouse-credentials`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
    });

const updateOrganizationWarehouseCredentials = async (
    lightdashApi: LightdashApi,
    {
        uuid,
        data,
    }: {
        uuid: string;
        data: UpdateOrganizationWarehouseCredentials;
    },
) =>
    lightdashApi<OrganizationWarehouseCredentials>({
        url: `/org/warehouse-credentials/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
        sensitive: true,
    });

const deleteOrganizationWarehouseCredentials = async (
    lightdashApi: LightdashApi,
    uuid: string,
) =>
    lightdashApi<undefined>({
        url: `/org/warehouse-credentials/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOrganizationWarehouseCredentials = (
    useQueryOptions?: UseQueryOptions<
        OrganizationWarehouseCredentials[],
        ApiError
    >,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<OrganizationWarehouseCredentials[], ApiError>({
        queryKey: ['organization-warehouse-credentials'],
        queryFn: () => getOrganizationWarehouseCredentials(lightdashApi),
        ...useQueryOptions,
    });
};

export const useCreateOrganizationWarehouseCredentials = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        OrganizationWarehouseCredentials,
        ApiError,
        CreateOrganizationWarehouseCredentials
    >(
        (data: CreateOrganizationWarehouseCredentials) =>
            createOrganizationWarehouseCredentials(lightdashApi, data),
        {
            mutationKey: ['organization-warehouse-credentials', 'create'],
            onSuccess: async () => {
                await queryClient.refetchQueries({
                    queryKey: ['organization-warehouse-credentials'],
                });
                showToastSuccess({
                    title: 'Warehouse credentials created',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create warehouse credentials',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateOrganizationWarehouseCredentials = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        OrganizationWarehouseCredentials,
        ApiError,
        { uuid: string; data: UpdateOrganizationWarehouseCredentials }
    >(
        (args: {
            uuid: string;
            data: UpdateOrganizationWarehouseCredentials;
        }) => updateOrganizationWarehouseCredentials(lightdashApi, args),
        {
            mutationKey: ['organization-warehouse-credentials', 'update'],
            onSuccess: async () => {
                await queryClient.refetchQueries({
                    queryKey: ['organization-warehouse-credentials'],
                });
                showToastSuccess({
                    title: 'Warehouse credentials updated',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update warehouse credentials',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteOrganizationWarehouseCredentials = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>(
        (uuid: string) =>
            deleteOrganizationWarehouseCredentials(lightdashApi, uuid),
        {
            mutationKey: ['organization-warehouse-credentials', 'delete'],
            onSuccess: async () => {
                await queryClient.invalidateQueries({
                    queryKey: ['organization-warehouse-credentials'],
                });
                showToastSuccess({
                    title: 'Warehouse credentials deleted',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to delete warehouse credentials',
                    apiError: error,
                });
            },
        },
    );
};

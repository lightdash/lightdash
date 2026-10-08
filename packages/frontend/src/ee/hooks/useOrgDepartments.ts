import {
    type ApiError,
    type CreateDepartment,
    type Department,
    type DepartmentMembership,
    type DepartmentOwnerInput,
    type OrganizationAdoptionSummary,
    type UpdateDepartment,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../../hooks/toaster/useToaster';

// Consumed by the table and drawer components that follow
// ts-unused-exports:disable-next-line
export const ORG_ADOPTION_QUERY_KEY = ['org-adoption'];

export const useOrgAdoptionSummary = (enabled = true) =>
    useQuery<OrganizationAdoptionSummary, ApiError>({
        queryKey: [...ORG_ADOPTION_QUERY_KEY, 'summary'],
        queryFn: () =>
            lightdashApi<OrganizationAdoptionSummary>({
                url: '/org/departments',
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });

export const useDepartmentMembership = (enabled = true) =>
    useQuery<DepartmentMembership[], ApiError>({
        queryKey: [...ORG_ADOPTION_QUERY_KEY, 'membership'],
        queryFn: () =>
            lightdashApi<DepartmentMembership[]>({
                url: '/org/departments/membership',
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });

const useInvalidateAdoption = () => {
    const queryClient = useQueryClient();
    return async () => {
        await queryClient.invalidateQueries(ORG_ADOPTION_QUERY_KEY);
    };
};

export const useCreateDepartment = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<Department, ApiError, CreateDepartment>(
        (data) =>
            lightdashApi<Department>({
                url: '/org/departments',
                method: 'POST',
                body: JSON.stringify(data),
            }),
        {
            onSuccess: async () => {
                await invalidate();
                showToastSuccess({ title: 'Department created' });
            },
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to create department',
                    apiError: error,
                }),
        },
    );
};

export const useUpdateDepartment = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Department,
        ApiError,
        { departmentUuid: string; data: UpdateDepartment }
    >(
        ({ departmentUuid, data }) =>
            lightdashApi<Department>({
                url: `/org/departments/${departmentUuid}`,
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
        {
            onSuccess: async () => {
                await invalidate();
                showToastSuccess({ title: 'Department updated' });
            },
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to update department',
                    apiError: error,
                }),
        },
    );
};

export const useDeleteDepartment = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (departmentUuid) =>
            lightdashApi<null>({
                url: `/org/departments/${departmentUuid}`,
                method: 'DELETE',
                body: undefined,
            }),
        {
            onSuccess: async () => {
                await invalidate();
                showToastSuccess({ title: 'Department deleted' });
            },
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to delete department',
                    apiError: error,
                }),
        },
    );
};

export const useSetDepartmentGroups = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastApiError } = useToaster();
    return useMutation<
        Department,
        ApiError,
        { departmentUuid: string; groupUuids: string[] }
    >(
        ({ departmentUuid, groupUuids }) =>
            lightdashApi<Department>({
                url: `/org/departments/${departmentUuid}/groups`,
                method: 'PUT',
                body: JSON.stringify({ groupUuids }),
            }),
        {
            onSuccess: invalidate,
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to update linked groups',
                    apiError: error,
                }),
        },
    );
};

export const useSetDepartmentMembers = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastApiError } = useToaster();
    return useMutation<
        Department,
        ApiError,
        { departmentUuid: string; userUuids: string[] }
    >(
        ({ departmentUuid, userUuids }) =>
            lightdashApi<Department>({
                url: `/org/departments/${departmentUuid}/members`,
                method: 'PUT',
                body: JSON.stringify({ userUuids }),
            }),
        {
            onSuccess: invalidate,
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to update assigned people',
                    apiError: error,
                }),
        },
    );
};

export const useSetDepartmentOwners = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastApiError } = useToaster();
    return useMutation<
        Department,
        ApiError,
        { departmentUuid: string; owners: DepartmentOwnerInput[] }
    >(
        ({ departmentUuid, owners }) =>
            lightdashApi<Department>({
                url: `/org/departments/${departmentUuid}/owners`,
                method: 'PUT',
                body: JSON.stringify({ owners }),
            }),
        {
            onSuccess: invalidate,
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to update owners',
                    apiError: error,
                }),
        },
    );
};

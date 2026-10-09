import {
    type ApiError,
    type CreateDepartment,
    type Department,
    type DepartmentDetail,
    type DepartmentMembership,
    type DepartmentOverlaps,
    type DepartmentOwnerInput,
    type OrganizationAdoptionSummary,
    type SetPrimaryDepartment,
    type UpdateDepartment,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { validate as isUuid } from 'uuid';
import { lightdashApi } from '../../api';
import useToaster from '../../hooks/toaster/useToaster';

const ORG_ADOPTION_QUERY_KEY = ['org-adoption'];

// Encoded, so a crafted value can never step out of the departments path
const departmentUrl = (departmentUuid: string, suffix = ''): string =>
    `/org/departments/${encodeURIComponent(departmentUuid)}${suffix}`;

export const useOrgAdoptionSummary = () =>
    useQuery<OrganizationAdoptionSummary, ApiError>({
        queryKey: [...ORG_ADOPTION_QUERY_KEY, 'summary'],
        queryFn: () =>
            lightdashApi<OrganizationAdoptionSummary>({
                url: '/org/departments',
                method: 'GET',
                body: undefined,
            }),
        retry: false,
    });

export const useDepartmentDetail = (departmentUuid: string | undefined) =>
    useQuery<DepartmentDetail, ApiError>({
        queryKey: [...ORG_ADOPTION_QUERY_KEY, 'detail', departmentUuid],
        queryFn: () =>
            lightdashApi<DepartmentDetail>({
                url: departmentUrl(departmentUuid ?? ''),
                method: 'GET',
                body: undefined,
            }),
        // Nothing is requested for a value that is not a uuid
        enabled: departmentUuid !== undefined && isUuid(departmentUuid),
        retry: false,
    });

// Each list is left out when empty, as the server reads an empty list as no list
const getOverlapsQuery = (
    withUuids: string[],
    withoutUuids: string[],
): string => {
    const params = new URLSearchParams();
    if (withUuids.length > 0) params.set('with', withUuids.join(','));
    if (withoutUuids.length > 0) params.set('without', withoutUuids.join(','));
    const query = params.toString();
    return query.length > 0 ? `?${query}` : '';
};

// The people of the department who are also in every "with" department and in no "without" one, plus its overlaps
export const useDepartmentOverlaps = (
    departmentUuid: string | undefined,
    withUuids: string[] = [],
    withoutUuids: string[] = [],
) =>
    useQuery<DepartmentOverlaps, ApiError>({
        queryKey: [
            ...ORG_ADOPTION_QUERY_KEY,
            'overlaps',
            departmentUuid,
            withUuids,
            withoutUuids,
        ],
        queryFn: () =>
            lightdashApi<DepartmentOverlaps>({
                url: departmentUrl(
                    departmentUuid ?? '',
                    `/overlaps${getOverlapsQuery(withUuids, withoutUuids)}`,
                ),
                method: 'GET',
                body: undefined,
            }),
        enabled: departmentUuid !== undefined && isUuid(departmentUuid),
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
                url: departmentUrl(departmentUuid),
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
                url: departmentUrl(departmentUuid),
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
                url: departmentUrl(departmentUuid, '/groups'),
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
                url: departmentUrl(departmentUuid, '/members'),
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
                url: departmentUrl(departmentUuid, '/owners'),
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

// Null counts the person in every department they are in again
export const useSetPrimaryDepartment = () => {
    const invalidate = useInvalidateAdoption();
    const { showToastApiError } = useToaster();
    return useMutation<
        null,
        ApiError,
        { userUuid: string } & SetPrimaryDepartment
    >(
        ({ userUuid, departmentUuid }) =>
            lightdashApi<null>({
                url: `/org/departments/people/${encodeURIComponent(userUuid)}/primary`,
                method: 'PUT',
                body: JSON.stringify({ departmentUuid }),
            }),
        {
            onSuccess: invalidate,
            onError: ({ error }) =>
                showToastApiError({
                    title: 'Failed to update where this person counts',
                    apiError: error,
                }),
        },
    );
};

import { subject } from '@casl/ability';
import {
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiPaginatedValidateResponse,
    type Explore,
    type ExploreError,
    type KnexPaginatedData,
    type ValidationErrorType,
    type ValidationResponse,
    type ValidationSourceType,
    type ValidationTarget,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { lightdashApi } from '../../api';
import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../toaster/useToaster';
import { useProject } from '../useProject';
import useUser, { type UserWithAbility } from '../user/useUser';

const LAST_VALIDATION_NOTIFICATION_KEY = 'lastValidationTimestamp';

const getValidation = async (
    projectUuid: string,
    fromSettings: boolean,
    jobId?: string,
): Promise<ValidationResponse[]> =>
    lightdashApi<ValidationResponse[]>({
        url: `/projects/${projectUuid}/validate?fromSettings=${fromSettings.toString()}&${
            jobId ? `jobId=${jobId}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const useValidation = (
    projectUuid: string,
    user: UseQueryResult<UserWithAbility, ApiError>,
    fromSettings: boolean = false,
) => {
    const [lastValidationNotification, setLastValidationNotification] =
        useLocalStorageState<string>(LAST_VALIDATION_NOTIFICATION_KEY);
    const organizationUuid = user.data?.organizationUuid;

    // Check if the user can manage validation feature
    const canManageValidation = user.data?.ability.can(
        'manage',
        subject('Validation', {
            organizationUuid,
            projectUuid,
        }),
    );

    return useQuery<ValidationResponse[], ApiError>({
        enabled: canManageValidation,
        queryKey: ['validation', fromSettings],
        queryFn: () => getValidation(projectUuid, fromSettings),
        retry: (_, error) => error.error.statusCode !== 403,
        staleTime: 0,
        onSuccess: (data) => {
            if (data.length === 0) return;
            const latestValidationTimestamp = data[0].createdAt.toString();
            const previousTimestamp = lastValidationNotification?.split(';')[0];

            // When it's empty, no last validation
            if (lastValidationNotification === '') {
                setLastValidationNotification(
                    `${latestValidationTimestamp};unread`,
                );
                return;
            }

            if (latestValidationTimestamp === previousTimestamp) return;

            // if they're not the same, update the last validation
            setLastValidationNotification(
                `${latestValidationTimestamp};unread`,
            );
        },
    });
};

const getPaginatedValidation = async (
    projectUuid: string,
    page: number,
    pageSize: number,
    options?: {
        searchQuery?: string;
        sortBy?: string;
        sortDirection?: 'asc' | 'desc';
        sourceTypes?: ValidationSourceType[];
        errorTypes?: ValidationErrorType[];
        includeChartConfigWarnings?: boolean;
        fromSettings?: boolean;
    },
): Promise<ApiPaginatedValidateResponse['results']> => {
    const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
    });

    if (options?.searchQuery) params.set('searchQuery', options.searchQuery);
    if (options?.sortBy) params.set('sortBy', options.sortBy);
    if (options?.sortDirection)
        params.set('sortDirection', options.sortDirection);
    if (options?.sourceTypes?.length)
        params.set('sourceTypes', options.sourceTypes.join(','));
    if (options?.errorTypes?.length)
        params.set('errorTypes', options.errorTypes.join(','));
    if (options?.includeChartConfigWarnings != null)
        params.set(
            'includeChartConfigWarnings',
            String(options.includeChartConfigWarnings),
        );
    if (options?.fromSettings != null)
        params.set('fromSettings', String(options.fromSettings));

    return lightdashApi<ApiPaginatedValidateResponse['results']>({
        url: `/projects/${projectUuid}/validate?${params.toString()}`,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });
};

export const usePaginatedValidation = (
    projectUuid: string,
    user: UseQueryResult<UserWithAbility, ApiError>,
    options?: {
        pageSize?: number;
        searchQuery?: string;
        sortBy?: string;
        sortDirection?: 'asc' | 'desc';
        sourceTypes?: ValidationSourceType[];
        errorTypes?: ValidationErrorType[];
        includeChartConfigWarnings?: boolean;
    },
) => {
    const organizationUuid = user.data?.organizationUuid;
    const canManageValidation = user.data?.ability.can(
        'manage',
        subject('Validation', {
            organizationUuid,
            projectUuid,
        }),
    );

    const pageSize = options?.pageSize ?? 20;

    return useInfiniteQuery<KnexPaginatedData<ValidationResponse[]>, ApiError>({
        queryKey: [
            'paginatedValidation',
            projectUuid,
            pageSize,
            options?.searchQuery,
            options?.sortBy,
            options?.sortDirection,
            options?.sourceTypes,
            options?.errorTypes,
            options?.includeChartConfigWarnings,
        ],
        queryFn: async ({ pageParam = 1 }) =>
            getPaginatedValidation(projectUuid, pageParam as number, pageSize, {
                searchQuery: options?.searchQuery,
                sortBy: options?.sortBy,
                sortDirection: options?.sortDirection,
                sourceTypes: options?.sourceTypes,
                errorTypes: options?.errorTypes,
                includeChartConfigWarnings: options?.includeChartConfigWarnings,
                fromSettings: true,
            }),
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: canManageValidation,
    });
};

type ValidationBody = {
    explores?: (Explore | ExploreError)[];
    validationTargets?: ValidationTarget[];
    onlyValidateExploresInArgs?: boolean;
};
const updateValidation = async (
    projectUuid: string,
    body: ValidationBody = {},
): Promise<ApiJobScheduledResponse['results']> =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/validate`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useValidationMutation = (
    projectUuid: string,
    onComplete: () => void,
    onError: () => void,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError, showToastApiError } =
        useToaster();

    return useMutation<ApiJobScheduledResponse['results'], ApiError>({
        mutationKey: ['validation', projectUuid],
        mutationFn: () => updateValidation(projectUuid),
        onSuccess: (data) => {
            // Wait until validation is complete
            pollJobStatus(data.jobId)
                .then(async () => {
                    onComplete();
                    await queryClient.invalidateQueries({
                        queryKey: ['validation'],
                    });
                    await queryClient.invalidateQueries({
                        queryKey: ['paginatedValidation'],
                    });
                    showToastSuccess({ title: 'Validation completed' });
                })
                .catch((error: Error) => {
                    onError();
                    showToastError({
                        title: 'Unable to update validation',
                        subtitle: error.message,
                    });
                });
        },
        onError: ({ error }) => {
            onError();
            showToastApiError({
                title: 'Failed to update validation',
                apiError: error,
            });
        },
    });
};

export const useValidationUserAbility = (projectUuid?: string) => {
    const { data: user } = useUser(true);
    const { data: project } = useProject(projectUuid);
    const canUserSeeValidationErrorsNotifications =
        !!user &&
        !!project &&
        user.ability?.can(
            'manage',
            subject('Validation', {
                organizationUuid: project.organizationUuid,
                projectUuid,
            }),
        );
    return canUserSeeValidationErrorsNotifications;
};

export const useValidationNotificationChecker = (): [boolean, () => void] => {
    const [lastValidationNotification, setLastValidationNotification] =
        useLocalStorageState<string>(LAST_VALIDATION_NOTIFICATION_KEY);

    const [lastValidationTimestamp = '', lastValidationStatus = ''] =
        lastValidationNotification ? lastValidationNotification.split(';') : [];

    const hasReadLastValidationNotification =
        !!lastValidationNotification && lastValidationStatus === 'read';

    const setHasReadLastValidationNotification = () =>
        lastValidationNotification &&
        setLastValidationNotification(`${lastValidationTimestamp};read`);

    return [
        hasReadLastValidationNotification,
        setHasReadLastValidationNotification,
    ];
};

const deleteValidation = async (
    projectUuid: string,
    validationId: number,
): Promise<null> =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/validate/${validationId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteValidation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, number>(
        (validationId) => deleteValidation(projectUuid, validationId),
        {
            mutationKey: ['delete_validation', projectUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['validation']);
                await queryClient.refetchQueries(['paginatedValidation']);
                showToastSuccess({
                    title: 'Validation dismissed',
                });
            },
            onError: async ({ error }) => {
                showToastApiError({
                    title: 'Failed to dismiss validation',
                    apiError: error,
                });
            },
        },
    );
};

export const useValidationWithResults = (projectUuid: string) => {
    const { showToastError, showToastApiError } = useToaster();
    const [isPolling, setIsPolling] = useState(false);

    const mutation = useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        ValidationBody & {
            onComplete: (response: ValidationResponse[]) => Promise<void>;
        }
    >({
        mutationFn: (validationBody) =>
            updateValidation(projectUuid, validationBody),
        onSuccess: (data, validationBody) => {
            setIsPolling(true);
            // Wait until validation is complete
            pollJobStatus(data.jobId)
                .then(async () => {
                    // Get results from validation and return on callback
                    const validationResponse = await getValidation(
                        projectUuid,
                        false,
                        data.jobId,
                    );
                    await validationBody.onComplete(validationResponse);
                })
                .catch((error: Error) => {
                    showToastError({
                        title: 'Unable to get validation',
                        subtitle: error.message,
                    });
                })
                .finally(() => {
                    setIsPolling(false);
                });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to get validation',
                apiError: error,
            });
            setIsPolling(false);
        },
    });

    return { ...mutation, isPolling };
};

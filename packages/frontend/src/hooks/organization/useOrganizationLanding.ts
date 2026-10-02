import {
    type ApiError,
    type OrganizationJoinRequest,
    type OrganizationJoinRequestSummary,
    type OrganizationLanding,
    type OrganizationMemberRole,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const LANDING_KEY = ['organization-landing'];
const JOIN_REQUESTS_KEY = ['organization-join-requests'];

export const useOrganizationLanding = (enabled: boolean) =>
    useQuery<OrganizationLanding, ApiError>({
        queryKey: LANDING_KEY,
        queryFn: () =>
            lightdashApi<OrganizationLanding>({
                url: '/user/me/organization-landing',
                method: 'GET',
                body: undefined,
            }),
        enabled,
    });

export const useRequestToJoinOrganization = () => {
    const queryClient = useQueryClient();
    return useMutation<OrganizationJoinRequestSummary, ApiError, string>(
        (organizationUuid) =>
            lightdashApi<OrganizationJoinRequestSummary>({
                url: '/user/me/organization-join-requests',
                method: 'POST',
                body: JSON.stringify({ organizationUuid }),
            }),
        {
            mutationKey: ['organization_join_request_create'],
            onSuccess: (summary, organizationUuid) => {
                queryClient.setQueryData<OrganizationLanding>(
                    LANDING_KEY,
                    (landing) =>
                        landing && {
                            ...landing,
                            requestable: landing.requestable.map((match) =>
                                match.organizationUuid === organizationUuid
                                    ? { ...match, joinRequest: summary }
                                    : match,
                            ),
                        },
                );
            },
        },
    );
};

export const useOrganizationJoinRequests = (enabled: boolean) =>
    useQuery<OrganizationJoinRequest[], ApiError>({
        queryKey: JOIN_REQUESTS_KEY,
        queryFn: () =>
            lightdashApi<OrganizationJoinRequest[]>({
                url: '/org/join-requests',
                method: 'GET',
                body: undefined,
            }),
        enabled,
    });

type JoinRequestDecision =
    | {
          joinRequestUuid: string;
          decision: 'approve';
          role: OrganizationMemberRole;
      }
    | { joinRequestUuid: string; decision: 'decline' };

export const useDecideOrganizationJoinRequest = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<null, ApiError, JoinRequestDecision>(
        (variables) =>
            lightdashApi<null>({
                url: `/org/join-requests/${variables.joinRequestUuid}/${variables.decision}`,
                method: 'POST',
                body: JSON.stringify(
                    variables.decision === 'approve'
                        ? { role: variables.role }
                        : {},
                ),
            }),
        {
            mutationKey: ['organization_join_request_decide'],
            onSuccess: (_data, variables) => {
                queryClient.setQueryData<OrganizationJoinRequest[]>(
                    JOIN_REQUESTS_KEY,
                    (requests) =>
                        requests?.filter(
                            (request) =>
                                request.joinRequestUuid !==
                                variables.joinRequestUuid,
                        ),
                );
                if (variables.decision === 'approve') {
                    void queryClient.invalidateQueries(['organization_users']);
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Could not update the request',
                    apiError: error,
                });
            },
        },
    );
};

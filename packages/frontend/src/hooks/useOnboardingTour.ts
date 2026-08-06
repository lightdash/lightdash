import type {
    ApiCompleteUserOnboardingTourRequest,
    ApiError,
    UserOnboarding,
    UserOnboardingTour,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { lightdashApi } from '../api';

const USER_ONBOARDING_QUERY_KEY = 'user-onboarding';

const getUserOnboarding = () =>
    lightdashApi<UserOnboarding>({
        url: '/user/onboarding',
        method: 'GET',
        body: undefined,
    });

const completeUserOnboardingTour = (tour: UserOnboardingTour) =>
    lightdashApi<undefined>({
        url: '/user/onboarding',
        method: 'POST',
        body: JSON.stringify({
            tour,
        } satisfies ApiCompleteUserOnboardingTourRequest),
    });

type UseOnboardingTourArgs = {
    tour: UserOnboardingTour;
    /** Gate the fetch off while the feature can't show the tour anyway. */
    enabled?: boolean;
};

type UseOnboardingTourResult = {
    /** Undefined while loading, then whether the user has completed this tour. */
    isCompleted: boolean | undefined;
    /** True once we know the tour hasn't been completed and it wasn't just closed. */
    shouldShow: boolean;
    /** Close the tour and persist the seen-flag server-side. */
    closeTour: () => void;
};

/**
 * Server-persisted analogue of `useGuidedTour`: the seen-flag lives in the
 * `user_onboarding` table so a tour shows once per user across devices. Pair
 * with the `<GuidedTour>` component for the spotlight rendering.
 */
// ts-unused-exports:disable-next-line
export const useOnboardingTour = ({
    tour,
    enabled = true,
}: UseOnboardingTourArgs): UseOnboardingTourResult => {
    const queryClient = useQueryClient();
    const [isDismissed, setIsDismissed] = useState(false);

    const { data } = useQuery<UserOnboarding, ApiError>({
        queryKey: [USER_ONBOARDING_QUERY_KEY],
        queryFn: getUserOnboarding,
        enabled,
        staleTime: Infinity,
    });

    const { mutate } = useMutation<undefined, ApiError, UserOnboardingTour>({
        mutationFn: completeUserOnboardingTour,
        onSuccess: (_result, completedTour) => {
            queryClient.setQueryData<UserOnboarding>(
                [USER_ONBOARDING_QUERY_KEY],
                (previous) =>
                    previous
                        ? {
                              completedTours: {
                                  ...previous.completedTours,
                                  [completedTour]: true,
                              },
                          }
                        : previous,
            );
        },
    });

    const isCompleted = data ? data.completedTours[tour] === true : undefined;

    const closeTour = useCallback(() => {
        setIsDismissed(true);
        mutate(tour);
    }, [mutate, tour]);

    return {
        isCompleted,
        shouldShow: enabled && !isDismissed && isCompleted === false,
        closeTour,
    };
};

/**
 * Registry of app-wide feature tours whose seen-flag is persisted per user.
 * Add a key here to introduce a new tour; no schema change needed.
 */
export const USER_ONBOARDING_TOURS = ['memoryTour'] as const;

export type UserOnboardingTour = (typeof USER_ONBOARDING_TOURS)[number];

export type UserOnboarding = {
    completedTours: Record<UserOnboardingTour, boolean>;
};

export type ApiGetUserOnboardingResponse = {
    status: 'ok';
    results: UserOnboarding;
};

export type ApiCompleteUserOnboardingTourRequest = {
    tour: UserOnboardingTour;
};

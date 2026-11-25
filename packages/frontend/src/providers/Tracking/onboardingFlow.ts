// 'legacy' marks project connections made outside the onboarding pages
export type OnboardingFlow = 'legacy' | 'new';

export const getOnboardingFlow = (pathname: string): OnboardingFlow =>
    pathname.startsWith('/onboarding/') ? 'new' : 'legacy';

import { OnboardingStepType } from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type OnboardingStepProperty =
    | 'connect'
    | 'profile'
    | 'semantic_layer'
    | 'dashboard';

const STEP_PROPERTY: Record<OnboardingStepType, OnboardingStepProperty> = {
    [OnboardingStepType.CONNECT]: 'connect',
    [OnboardingStepType.PROFILE]: 'profile',
    [OnboardingStepType.SEMANTIC_LAYER]: 'semantic_layer',
    [OnboardingStepType.DASHBOARD]: 'dashboard',
};

/**
 * Emits `viewed` on mount for the given step and returns typed helpers to emit
 * `completed`/`failed`. Follows the repo tracking convention (typed EventData).
 */
export const useOnboardingAnalytics = (step: OnboardingStepType) => {
    const { track } = useTracking();
    const properties = useMemo(() => ({ step: STEP_PROPERTY[step] }), [step]);

    useEffect(() => {
        track({ name: EventName.ONBOARDING_STEP_VIEWED, properties });
    }, [track, properties]);

    const trackCompleted = useCallback(() => {
        track({ name: EventName.ONBOARDING_STEP_COMPLETED, properties });
    }, [track, properties]);

    const trackFailed = useCallback(() => {
        track({ name: EventName.ONBOARDING_STEP_FAILED, properties });
    }, [track, properties]);

    return { trackCompleted, trackFailed };
};

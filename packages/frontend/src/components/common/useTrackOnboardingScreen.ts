import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import useApp from '../../providers/App/useApp';
import { type OnboardingScreen } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

// Module scope so time on a screen survives the page swap to the next one
let lastScreenViewedAt: number | null = null;
let hiddenSince: number | null = null;
let hiddenMs = 0;
// Identify once per page load so onboarding events join the user's profile
let identifiedUserUuid: string | null = null;

// Time in a background tab is not time on the screen
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        hiddenSince = Date.now();
    } else if (hiddenSince !== null) {
        hiddenMs += Date.now() - hiddenSince;
        hiddenSince = null;
    }
});

const takeSecondsOnPreviousScreen = (now: number): number | null => {
    const hidden = hiddenMs + (hiddenSince === null ? 0 : now - hiddenSince);
    const seconds =
        lastScreenViewedAt === null
            ? null
            : Math.round((now - lastScreenViewedAt - hidden) / 1000);
    lastScreenViewedAt = now;
    hiddenMs = 0;
    hiddenSince = document.hidden ? now : null;
    return seconds;
};

export const useTrackOnboardingScreen = (screen: OnboardingScreen | null) => {
    const tracking = useTracking({ failSilently: true });
    const track = tracking?.track;
    const identify = tracking?.identify;
    const { user } = useApp();
    const userUuid = user.data?.userUuid ?? null;
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const organizationId = user.data?.organizationUuid ?? null;
    const projectId = projectUuid ?? null;
    const trackedScreen = useRef<OnboardingScreen | null>(null);
    useEffect(() => {
        if (trackedScreen.current === screen) return;
        trackedScreen.current = screen;
        if (!screen || !track) return;
        if (identify && userUuid && userUuid !== identifiedUserUuid) {
            identifiedUserUuid = userUuid;
            identify({ id: userUuid });
        }
        track({
            name: EventName.ONBOARDING_SCREEN_VIEWED,
            properties: {
                screen,
                organizationId,
                projectId,
                secondsOnPreviousScreen: takeSecondsOnPreviousScreen(
                    Date.now(),
                ),
            },
        });
    }, [screen, track, identify, userUuid, organizationId, projectId]);
};

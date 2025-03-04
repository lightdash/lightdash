import { type HealthState, type LightdashUser } from '@lightdash/common';
import {
    init,
    reactRouterV7BrowserTracingIntegration,
    replayIntegration,
    setTag,
    setUser,
} from '@sentry/react';
import { useEffect, useState } from 'react';
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from 'react-router';

const useSentry = (
    sentryConfig: HealthState['sentry'] | undefined,
    user: LightdashUser | undefined,
) => {
    const [isSentryLoaded, setIsSentryLoaded] = useState(false);

    useEffect(() => {
        if (sentryConfig && !isSentryLoaded && sentryConfig.frontend.dsn) {
            init({
                dsn: sentryConfig.frontend.dsn,
                release: sentryConfig.release,
                environment: sentryConfig.environment,
                integrations: [
                    reactRouterV7BrowserTracingIntegration({
                        useEffect,
                        useLocation,
                        useNavigationType,
                        createRoutesFromChildren,
                        matchRoutes,
                    }),
                    replayIntegration(),
                ],
                tracesSampler(samplingContext) {
                    if (samplingContext.parentSampled !== undefined) {
                        return samplingContext.parentSampled;
                    }

                    return sentryConfig.tracesSampleRate;
                },
                replaysOnErrorSampleRate: 1.0,
                debug: true,
            });
            setIsSentryLoaded(true);
        }
        if (user) {
            setUser({
                id: user.userUuid,
                email: user.email,
                username: user.email,
            });
            setTag('organization', user.organizationUuid);
        }
    }, [isSentryLoaded, setIsSentryLoaded, sentryConfig, user]);
};

export default useSentry;

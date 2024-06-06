import { type HealthState, type LightdashUser } from '@lightdash/common';
import * as Sentry from '@sentry/react';
import { useEffect, useState } from 'react';

const useSentry = (
    sentryConfig: HealthState['sentry'] | undefined,
    user: LightdashUser | undefined,
) => {
    const [isSentryLoaded, setIsSentryLoaded] = useState(false);

    useEffect(() => {
        if (sentryConfig && !isSentryLoaded && sentryConfig.frontend.dsn) {
            Sentry.init({
                dsn: sentryConfig.frontend.dsn,
                debug: true,
                release: sentryConfig.release,
                environment: sentryConfig.environment,
                integrations: [
                    Sentry.browserTracingIntegration({
                        enableInp: true,
                    }),
                    Sentry.replayIntegration(),
                ],
                tracesSampler(samplingContext) {
                    if (samplingContext.parentSampled !== undefined) {
                        return samplingContext.parentSampled;
                    }

                    return sentryConfig.tracesSampleRate;
                },
                replaysOnErrorSampleRate: 1.0,
            });
            setIsSentryLoaded(true);
        }
        if (user) {
            Sentry.setUser({
                id: user.userUuid,
                email: user.email,
                username: user.email,
            });
            Sentry.setTag('organization', user.organizationUuid);
        }
    }, [isSentryLoaded, setIsSentryLoaded, sentryConfig, user]);
};

export default useSentry;

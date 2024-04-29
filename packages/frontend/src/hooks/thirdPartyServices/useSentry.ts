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
                release: sentryConfig.release,
                environment: sentryConfig.environment,
                integrations: [
                    Sentry.browserTracingIntegration(),
                    Sentry.replayIntegration(),
                ],
                tracesSampler(samplingContext) {
                    // TODO: verify if this is the right way to sample errors
                    if (samplingContext.transactionContext?.name === 'error') {
                        return 1.0;
                    }
                    return 0.5;
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
                segment: user.organizationUuid,
            });
        }
    }, [isSentryLoaded, setIsSentryLoaded, sentryConfig, user]);
};

export default useSentry;

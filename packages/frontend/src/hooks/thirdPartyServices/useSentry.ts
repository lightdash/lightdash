import { HealthState, LightdashUser } from '@lightdash/common';
import * as Sentry from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import { useEffect, useState } from 'react';

const useSentry = (
    sentryConfig: HealthState['sentry'] | undefined,
    user: LightdashUser | undefined,
) => {
    const [isSentryLoaded, setIsSentryLoaded] = useState(false);

    useEffect(() => {
        if (sentryConfig && !isSentryLoaded && sentryConfig.dsn) {
            Sentry.init({
                dsn: sentryConfig.dsn,
                release: sentryConfig.release,
                environment: sentryConfig.environment,
                integrations: [new Integrations.BrowserTracing()],
                tracesSampleRate: 1.0,
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

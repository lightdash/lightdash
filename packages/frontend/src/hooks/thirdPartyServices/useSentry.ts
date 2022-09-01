import { HealthState } from '@lightdash/common';
import * as Sentry from '@sentry/react';
import { Integrations } from '@sentry/tracing';
import { useEffect, useState } from 'react';

const useSentry = (sentryConfig: HealthState['sentry'] | undefined) => {
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
    }, [isSentryLoaded, setIsSentryLoaded, sentryConfig]);
};

export default useSentry;

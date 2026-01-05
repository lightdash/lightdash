import { type HealthState, type LightdashUser } from '@lightdash/common';
import {
    init,
    reactRouterV7BrowserTracingIntegration,
    replayIntegration,
    setTag,
    setTags,
    setUser,
    spotlightBrowserIntegration,
} from '@sentry/react';
import { useEffect, useState } from 'react';
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
    useParams,
} from 'react-router';
import {
    hasRecentChunkReload,
    isChunkLoadErrorObject,
} from '../../features/chunkErrorHandler';

const sentrySpotlightEnabled =
    import.meta.env.DEV && import.meta.env.VITE_SENTRY_SPOTLIGHT;

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
                    ...(sentrySpotlightEnabled
                        ? [
                              spotlightBrowserIntegration({
                                  sidecarUrl: import.meta.env
                                      .VITE_SENTRY_SPOTLIGHT,
                              }),
                          ]
                        : []),
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
                    if (sentrySpotlightEnabled) {
                        return 1.0;
                    }

                    if (samplingContext.parentSampled !== undefined) {
                        return samplingContext.parentSampled;
                    }

                    return sentryConfig.tracesSampleRate;
                },
                replaysOnErrorSampleRate: 1.0,
                beforeSend(event, hint) {
                    const error = hint.originalException;
                    // For chunk load errors, only send to Sentry if auto-reload already failed
                    if (
                        isChunkLoadErrorObject(error) &&
                        !hasRecentChunkReload()
                    ) {
                        return null;
                    }

                    // Filter SyntaxErrors that originate entirely from third-party code
                    // These are typically caused by network issues, browser extensions,
                    // or CDN serving corrupted bundles - not actionable by us
                    if (error instanceof SyntaxError) {
                        const frames =
                            event.exception?.values?.[0]?.stacktrace?.frames;
                        const hasInAppFrame =
                            frames &&
                            frames.length > 0 &&
                            frames.some((frame) => frame.in_app === true);
                        if (frames && frames.length > 0 && !hasInAppFrame) {
                            return null;
                        }
                    }

                    return event;
                },
            });
            setIsSentryLoaded(true);
        }
        if (user) {
            setUser({
                id: user.userUuid,
                email: user.email,
                username: user.email,
            });
            setTags({
                'user.uuid': user.userUuid,
                'organization.uuid': user.organizationUuid,
            });
        }
    }, [isSentryLoaded, setIsSentryLoaded, sentryConfig, user]);

    const { projectUuid } = useParams<{ projectUuid?: string }>();
    const location = useLocation();
    useEffect(() => {
        if (projectUuid) {
            setTag('project.uuid', projectUuid);
        }
    }, [location, projectUuid]);
};

export default useSentry;

import { type HealthState, type LightdashUser } from '@lightdash/common';
import {
    init,
    isInitialized,
    reactRouterV7BrowserTracingIntegration,
    replayIntegration,
    setTag,
    setTags,
    setUser,
} from '@sentry/react';
import { useEffect } from 'react';
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
    RouteChunkLoadError,
} from '../../features/chunkErrorHandler';

const useSentry = (
    sentryConfig: HealthState['sentry'] | undefined,
    user: LightdashUser | undefined,
    disableDashboardTracing?: boolean,
) => {
    useEffect(() => {
        const dsn = sentryConfig?.frontend.dsn;
        if (sentryConfig && dsn && !isInitialized()) {
            init({
                dsn,
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
                    if (disableDashboardTracing) {
                        const name =
                            samplingContext.name ||
                            samplingContext.transactionContext?.name ||
                            window.location.pathname;
                        if (name.includes('/dashboards/')) {
                            return 0;
                        }
                    }

                    if (samplingContext.parentSampled !== undefined) {
                        return samplingContext.parentSampled;
                    }

                    return sentryConfig.tracesSampleRate;
                },
                replaysOnErrorSampleRate: 1.0,
                beforeSend(event, hint) {
                    const error = hint.originalException;
                    if (error instanceof RouteChunkLoadError) {
                        event.tags = {
                            ...event.tags,
                            'route.module': error.routeModule,
                        };
                        event.fingerprint = ['route-chunk-load-error'];
                    }

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
    }, [sentryConfig, user, disableDashboardTracing]);

    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid?: string;
        dashboardUuid?: string;
    }>();
    const location = useLocation();
    useEffect(() => {
        if (projectUuid) {
            setTag('project.uuid', projectUuid);
        }
        if (dashboardUuid) {
            setTag('dashboard.uuid', dashboardUuid);
        }
    }, [location, projectUuid, dashboardUuid]);
};

export default useSentry;

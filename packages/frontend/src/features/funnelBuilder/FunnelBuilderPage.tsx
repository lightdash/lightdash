import { type ApiErrorDetail } from '@lightdash/common';
import { Badge, Group, Title } from '@mantine/core';
import { IconFlask2Filled } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { Navigate } from 'react-router';
import Page from '../../components/common/Page/Page';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { store } from '../sqlRunner/store';
import { FunnelBuilderSidebar } from './components/FunnelBuilderSidebar';
import { FunnelMainContent } from './components/FunnelMainContent';
import { useFunnelUrlSync } from './hooks/useFunnelUrlSync';
import { useAppDispatch, useAppSelector } from './store';
import {
    resetState,
    selectEventNamesError,
    selectQueryError,
    setProjectUuid,
} from './store/funnelBuilderSlice';

const isApiErrorDetail = (
    error: ApiErrorDetail | { message?: string } | null,
): error is ApiErrorDetail => {
    return error !== null && 'statusCode' in error;
};

const FunnelBuilder: FC = () => {
    const { t } = useTranslation('metricsCatalog');
    const projectUuid = useProjectUuid();
    const dispatch = useAppDispatch();
    const { showToastApiError, showToastError } = useToaster();

    // Error states from Redux
    const queryError = useAppSelector(selectQueryError);
    const eventNamesError = useAppSelector(selectEventNamesError);

    // Track shown errors to prevent duplicate toasts
    const shownQueryError = useRef<typeof queryError>(null);
    const shownEventNamesError = useRef<typeof eventNamesError>(null);

    // Sync funnel state with URL for sharing and persistence
    useFunnelUrlSync();

    useEffect(() => {
        if (projectUuid) {
            dispatch(setProjectUuid(projectUuid));
        }
        return () => {
            dispatch(resetState());
        };
    }, [projectUuid, dispatch]);

    // Show toast when funnel query fails
    useEffect(() => {
        if (queryError && queryError !== shownQueryError.current) {
            shownQueryError.current = queryError;
            if (isApiErrorDetail(queryError)) {
                showToastApiError({
                    title: t('funnelBuilder.toasts.runFailed'),
                    apiError: queryError,
                });
            } else {
                showToastError({
                    title: t('funnelBuilder.toasts.runFailed'),
                    subtitle:
                        queryError.message ??
                        t('funnelBuilder.toasts.unexpectedError'),
                });
            }
        }
    }, [queryError, showToastApiError, showToastError, t]);

    // Show toast when fetching event names fails
    useEffect(() => {
        if (
            eventNamesError &&
            eventNamesError !== shownEventNamesError.current
        ) {
            shownEventNamesError.current = eventNamesError;
            if (isApiErrorDetail(eventNamesError)) {
                showToastApiError({
                    title: t('funnelBuilder.toasts.loadEventNamesFailed'),
                    apiError: eventNamesError,
                });
            } else {
                showToastError({
                    title: t('funnelBuilder.toasts.loadEventNamesFailed'),
                    subtitle:
                        eventNamesError.message ??
                        t('funnelBuilder.toasts.unexpectedError'),
                });
            }
        }
    }, [eventNamesError, showToastApiError, showToastError, t]);

    const sidebar = useMemo(
        () =>
            projectUuid ? (
                <FunnelBuilderSidebar projectUuid={projectUuid} />
            ) : null,
        [projectUuid],
    );

    if (!projectUuid) return null;

    return (
        <Page
            title={t('funnelBuilder.title')}
            sidebar={sidebar}
            withFullHeight
            withPaddedContent
        >
            <Group gap="sm" mb="md">
                <Title order={4}>{t('funnelBuilder.title')}</Title>
                <Badge
                    color="violet"
                    size="sm"
                    leftSection={<IconFlask2Filled size={12} />}
                >
                    {t('funnelBuilder.experimental')}
                </Badge>
            </Group>
            <FunnelMainContent />
        </Page>
    );
};

const FunnelBuilderPage: FC = () => {
    const projectUuid = useProjectUuid();
    const health = useHealth();

    // Redirect to home if feature is disabled
    if (health.data && !health.data.funnelBuilder.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <Provider store={store}>
            <FunnelBuilder />
        </Provider>
    );
};

export default FunnelBuilderPage;

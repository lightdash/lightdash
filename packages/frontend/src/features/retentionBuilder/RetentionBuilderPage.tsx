import { FeatureFlags, type ApiErrorDetail } from '@lightdash/common';
import { Badge, Group, Title } from '@mantine/core';
import { IconFlask2Filled } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { Provider } from 'react-redux';
import { Navigate } from 'react-router';
import Page from '../../components/common/Page/Page';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { store } from '../sqlRunner/store';
import { RetentionBuilderSidebar } from './components/RetentionBuilderSidebar';
import { RetentionMainContent } from './components/RetentionMainContent';
import { useRetentionUrlSync } from './hooks/useRetentionUrlSync';
import { useAppDispatch, useAppSelector } from './store';
import {
    resetState,
    selectEventNamesError,
    selectQueryError,
    setProjectUuid,
} from './store/retentionBuilderSlice';

const isApiErrorDetail = (
    error: ApiErrorDetail | { message?: string } | null,
): error is ApiErrorDetail => error !== null && 'statusCode' in error;

const RetentionBuilder: FC = () => {
    const projectUuid = useProjectUuid();
    const dispatch = useAppDispatch();
    const { showToastApiError, showToastError } = useToaster();

    const queryError = useAppSelector(selectQueryError);
    const eventNamesError = useAppSelector(selectEventNamesError);
    const shownQueryError = useRef<typeof queryError>(null);
    const shownEventNamesError = useRef<typeof eventNamesError>(null);

    useRetentionUrlSync();

    useEffect(() => {
        if (projectUuid) {
            dispatch(setProjectUuid(projectUuid));
        }
        return () => {
            dispatch(resetState());
        };
    }, [projectUuid, dispatch]);

    useEffect(() => {
        if (queryError && queryError !== shownQueryError.current) {
            shownQueryError.current = queryError;
            if (isApiErrorDetail(queryError)) {
                showToastApiError({
                    title: 'Failed to run retention query',
                    apiError: queryError,
                });
            } else {
                showToastError({
                    title: 'Failed to run retention query',
                    subtitle:
                        queryError.message ?? 'An unexpected error occurred',
                });
            }
        }
    }, [queryError, showToastApiError, showToastError]);

    useEffect(() => {
        if (
            eventNamesError &&
            eventNamesError !== shownEventNamesError.current
        ) {
            shownEventNamesError.current = eventNamesError;
            if (isApiErrorDetail(eventNamesError)) {
                showToastApiError({
                    title: 'Failed to load event names',
                    apiError: eventNamesError,
                });
            } else {
                showToastError({
                    title: 'Failed to load event names',
                    subtitle:
                        eventNamesError.message ??
                        'An unexpected error occurred',
                });
            }
        }
    }, [eventNamesError, showToastApiError, showToastError]);

    const sidebar = useMemo(
        () =>
            projectUuid ? (
                <RetentionBuilderSidebar projectUuid={projectUuid} />
            ) : null,
        [projectUuid],
    );

    if (!projectUuid) return null;

    return (
        <Page
            title="Retention Builder"
            sidebar={sidebar}
            withFullHeight
            withPaddedContent
        >
            <Group gap="sm" mb="md">
                <Title order={4}>Retention Builder</Title>
                <Badge
                    color="violet"
                    size="sm"
                    leftSection={<IconFlask2Filled size={12} />}
                >
                    Experimental
                </Badge>
            </Group>
            <RetentionMainContent projectUuid={projectUuid} />
        </Page>
    );
};

const RetentionBuilderPage: FC = () => {
    const projectUuid = useProjectUuid();
    const flag = useServerFeatureFlag(FeatureFlags.RetentionBuilder);

    if (flag.isInitialLoading) return null;

    if (!flag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <Provider store={store}>
            <RetentionBuilder />
        </Provider>
    );
};

export default RetentionBuilderPage;

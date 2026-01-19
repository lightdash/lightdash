import { Badge, Group, Title } from '@mantine-8/core';
import { IconFlask2Filled } from '@tabler/icons-react';
import { type FC, useEffect, useMemo } from 'react';
import { Provider } from 'react-redux';
import { Navigate, useParams } from 'react-router';
import Page from '../../components/common/Page/Page';
import useHealth from '../../hooks/health/useHealth';
import { store } from '../sqlRunner/store';
import { FunnelBuilderSidebar } from './components/FunnelBuilderSidebar';
import { FunnelMainContent } from './components/FunnelMainContent';
import { useFunnelUrlSync } from './hooks/useFunnelUrlSync';
import { useAppDispatch } from './store';
import { resetState, setProjectUuid } from './store/funnelBuilderSlice';

const FunnelBuilder: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const dispatch = useAppDispatch();

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
            title="Funnel Builder"
            sidebar={sidebar}
            withFullHeight
            withPaddedContent
        >
            <Group gap="sm" mb="md">
                <Title order={4}>Funnel Builder</Title>
                <Badge
                    variant="light"
                    color="violet"
                    size="sm"
                    leftSection={<IconFlask2Filled size={12} />}
                >
                    Experimental
                </Badge>
            </Group>
            <FunnelMainContent />
        </Page>
    );
};

const FunnelBuilderPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
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

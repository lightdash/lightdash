import { FeatureFlags } from '@lightdash/common';
import { Badge, Group, Title } from '@mantine/core';
import { IconFlask2Filled } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { Navigate } from 'react-router';
import Page from '../../../components/common/Page/Page';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { store } from '../../sqlRunner/store';

type RouteProps = {
    children: ReactNode;
};

/** Gates an event analytics page behind the feature flag and provides the store. */
export const EventAnalyticsRoute: FC<RouteProps> = ({ children }) => {
    const projectUuid = useProjectUuid();
    const flag = useServerFeatureFlag(FeatureFlags.EventAnalytics);

    if (flag.isInitialLoading) return null;
    if (!flag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return <Provider store={store}>{children}</Provider>;
};

type PageProps = {
    title: string;
    sidebar: ReactNode;
    children: ReactNode;
};

/** Page shell shared by the event analytics builders. */
export const EventAnalyticsPage: FC<PageProps> = ({
    title,
    sidebar,
    children,
}) => (
    <Page title={title} sidebar={sidebar} withFullHeight withPaddedContent>
        <Group gap="sm" mb="md">
            <Title order={4}>{title}</Title>
            <Badge
                color="violet"
                size="sm"
                leftSection={<IconFlask2Filled size={12} />}
            >
                Experimental
            </Badge>
        </Group>
        {children}
    </Page>
);

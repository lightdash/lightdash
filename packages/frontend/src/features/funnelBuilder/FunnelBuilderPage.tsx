import { useEffect, useMemo, type FC } from 'react';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import {
    EventAnalyticsPage,
    EventAnalyticsRoute,
} from '../eventAnalytics/components/EventAnalyticsPage';
import { EventAnalyticsSidebar } from '../eventAnalytics/components/EventAnalyticsSidebar';
import { useQueryErrorToasts } from '../eventAnalytics/hooks/useQueryErrorToasts';
import { FunnelFieldsTab } from './components/FunnelFieldsTab';
import { FunnelMainContent } from './components/FunnelMainContent';
import { FunnelStepsTab } from './components/FunnelStepsTab';
import { useFunnelUrlSync } from './hooks/useFunnelUrlSync';
import { useAppDispatch, useAppSelector } from './store';
import {
    resetState,
    selectActiveTab,
    selectEventNamesError,
    selectQueryError,
    setActiveTab,
    setProjectUuid,
} from './store/funnelBuilderSlice';

const TITLE = 'Funnel builder';

const FunnelBuilder: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const dispatch = useAppDispatch();
    const activeTab = useAppSelector(selectActiveTab);
    const queryError = useAppSelector(selectQueryError);
    const eventNamesError = useAppSelector(selectEventNamesError);

    useFunnelUrlSync();
    useQueryErrorToasts(
        useMemo(
            () => [
                { title: "Couldn't run the funnel query", error: queryError },
                { title: "Couldn't load event names", error: eventNamesError },
            ],
            [queryError, eventNamesError],
        ),
    );

    useEffect(() => {
        dispatch(setProjectUuid(projectUuid));
        return () => {
            dispatch(resetState());
        };
    }, [projectUuid, dispatch]);

    return (
        <EventAnalyticsPage
            title={TITLE}
            sidebar={
                <EventAnalyticsSidebar
                    title={TITLE}
                    activeTab={activeTab}
                    onTabChange={(tab) => dispatch(setActiveTab(tab))}
                    tabs={[
                        {
                            value: 'fields',
                            label: 'Fields',
                            content: (
                                <FunnelFieldsTab projectUuid={projectUuid} />
                            ),
                        },
                        {
                            value: 'steps',
                            label: 'Steps',
                            content: <FunnelStepsTab />,
                        },
                    ]}
                />
            }
        >
            <FunnelMainContent projectUuid={projectUuid} />
        </EventAnalyticsPage>
    );
};

const FunnelBuilderPage: FC = () => {
    const projectUuid = useProjectUuid();
    if (!projectUuid) return null;
    return (
        <EventAnalyticsRoute>
            <FunnelBuilder projectUuid={projectUuid} />
        </EventAnalyticsRoute>
    );
};

export default FunnelBuilderPage;

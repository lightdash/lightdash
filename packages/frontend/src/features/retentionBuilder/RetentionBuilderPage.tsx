import { useEffect, useMemo, type FC } from 'react';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import {
    EventAnalyticsPage,
    EventAnalyticsRoute,
} from '../eventAnalytics/components/EventAnalyticsPage';
import { EventAnalyticsSidebar } from '../eventAnalytics/components/EventAnalyticsSidebar';
import { useQueryErrorToasts } from '../eventAnalytics/hooks/useQueryErrorToasts';
import { RetentionFieldsTab } from './components/RetentionFieldsTab';
import { RetentionMainContent } from './components/RetentionMainContent';
import { RetentionSettingsTab } from './components/RetentionSettingsTab';
import { useRetentionUrlSync } from './hooks/useRetentionUrlSync';
import { useAppDispatch, useAppSelector } from './store';
import {
    resetState,
    selectActiveTab,
    selectEventNamesError,
    selectQueryError,
    setActiveTab,
    setProjectUuid,
} from './store/retentionBuilderSlice';

const TITLE = 'Retention builder';

const RetentionBuilder: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const dispatch = useAppDispatch();
    const activeTab = useAppSelector(selectActiveTab);
    const queryError = useAppSelector(selectQueryError);
    const eventNamesError = useAppSelector(selectEventNamesError);

    useRetentionUrlSync();
    useQueryErrorToasts(
        useMemo(
            () => [
                {
                    title: "Couldn't run the retention query",
                    error: queryError,
                },
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
                                <RetentionFieldsTab projectUuid={projectUuid} />
                            ),
                        },
                        {
                            value: 'retention',
                            label: 'Retention',
                            content: <RetentionSettingsTab />,
                        },
                    ]}
                />
            }
        >
            <RetentionMainContent projectUuid={projectUuid} />
        </EventAnalyticsPage>
    );
};

const RetentionBuilderPage: FC = () => {
    const projectUuid = useProjectUuid();
    if (!projectUuid) return null;
    return (
        <EventAnalyticsRoute>
            <RetentionBuilder projectUuid={projectUuid} />
        </EventAnalyticsRoute>
    );
};

export default RetentionBuilderPage;

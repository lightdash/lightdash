import { LightdashMode } from '@lightdash/common';
import {
    createContext,
    memo,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { type FormState } from 'react-hook-form';
import * as rudderSDK from 'rudder-sdk-js';
import {
    PageType,
    type CategoryName,
    type EventName,
    type PageName,
    type SectionName,
} from '../types/Events';
import { useApp } from './AppProvider';

type GenericEvent = {
    name:
        | EventName.REVOKE_INVITES_BUTTON_CLICKED
        | EventName.INVITE_BUTTON_CLICKED
        | EventName.RUN_QUERY_BUTTON_CLICKED
        | EventName.UPDATE_DASHBOARD_NAME_CLICKED
        | EventName.ADD_COLUMN_BUTTON_CLICKED
        | EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.DELETE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.EDIT_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_BUTTON_CLICKED
        | EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED
        | EventName.UPDATE_PROJECT_TABLES_CONFIGURATION_BUTTON_CLICKED
        | EventName.UPDATE_PROJECT_BUTTON_CLICKED
        | EventName.UPDATE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.CREATE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.CREATE_QUICK_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.ADD_FILTER_CLICKED
        | EventName.NOTIFICATIONS_CLICKED
        | EventName.NOTIFICATIONS_ITEM_CLICKED
        | EventName.NOTIFICATIONS_READ_MORE_CLICKED
        | EventName.ADD_CUSTOM_METRIC_CLICKED
        | EventName.REMOVE_CUSTOM_METRIC_CLICKED
        | EventName.CUSTOM_AXIS_RANGE_TOGGLE_CLICKED
        | EventName.CREATE_PROJECT_ACCESS_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_CLI_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_MANUALLY_BUTTON_CLICKED
        | EventName.COPY_CREATE_PROJECT_CODE_BUTTON_CLICKED
        | EventName.TRY_DEMO_CLICKED
        | EventName.GO_TO_LINK_CLICKED
        | EventName.USAGE_ANALYTICS_CLICKED
        | EventName.VIEW_UNDERLYING_DATA_CLICKED
        | EventName.DRILL_BY_CLICKED
        | EventName.SCHEDULER_SEND_NOW_BUTTON
        | EventName.ADD_CUSTOM_DIMENSION_CLICKED
        | EventName.DATE_ZOOM_CLICKED
        | EventName.COMMENTS_CLICKED
        | EventName.NOTIFICATIONS_COMMENTS_ITEM_CLICKED
        | EventName.DASHBOARD_AUTO_REFRESH_UPDATED;
    properties?: {};
};

type DocumentationClickedEvent = {
    name: EventName.DOCUMENTATION_BUTTON_CLICKED;
    properties: {
        action:
            | 'invite_user'
            | 'save_chart'
            | 'run_query'
            | 'define_metrics'
            | 'connect_project'
            | 'getting_started';
    };
};

export type OnboardingStepClickedEvent = {
    name: EventName.ONBOARDING_STEP_CLICKED;
    properties: {
        action:
            | 'invite_user'
            | 'save_chart'
            | 'run_query'
            | 'define_metrics'
            | 'connect_project';
    };
};

export type SetupStepClickedEvent = {
    name: EventName.SETUP_STEP_CLICKED;
    properties: {
        action: 'create_user' | 'create_project';
    };
};

export type SearchResultClickedEvent = {
    name: EventName.SEARCH_RESULT_CLICKED;
    properties: {
        type:
            | 'space'
            | 'dashboard'
            | 'saved_chart'
            | 'table'
            | 'field'
            | 'sql_chart'
            | 'page';
        id: string;
    };
};

export type GlobalSearchOpenEvent = {
    name: EventName.GLOBAL_SEARCH_OPEN;
    properties: {
        action: 'input_click' | 'hotkeys';
    };
};

export type GlobalSearchClosedEvent = {
    name: EventName.GLOBAL_SEARCH_CLOSED;
    properties: {
        action: 'result_click' | 'default';
    };
};

export type FormClickedEvent = {
    name: EventName.FORM_STATE_CHANGED;
    properties: {
        form: string;
        formState: FormState<any>;
    };
};

export type CrossFilterDashboardAppliedEvent = {
    name: EventName.CROSS_FILTER_DASHBOARD_APPLIED;
    properties: {
        fieldType: string | undefined;
        dashboardId: string;
        projectId: string;
    };
};

export type ViewUnderlyingDataClickedEvent = {
    name: EventName.VIEW_UNDERLYING_DATA_CLICKED;
    properties: {
        organizationId: string;
        userId: string;
        projectId: string;
    };
};

export type DrillByClickedEvent = {
    name: EventName.DRILL_BY_CLICKED;
    properties: {
        organizationId: string;
        userId: string;
        projectId: string;
    };
};

export type DashboardAutoRefreshUpdateEvent = {
    name: EventName.DASHBOARD_AUTO_REFRESH_UPDATED;
    properties: {
        organizationId: string;
        userId: string;
        projectId: string;
        dashboardId: string;
        frequency: string;
    };
};

export type EventData =
    | GenericEvent
    | FormClickedEvent
    | SetupStepClickedEvent
    | DocumentationClickedEvent
    | SearchResultClickedEvent
    | GlobalSearchOpenEvent
    | GlobalSearchClosedEvent
    | OnboardingStepClickedEvent
    | CrossFilterDashboardAppliedEvent
    | ViewUnderlyingDataClickedEvent
    | DrillByClickedEvent
    | DashboardAutoRefreshUpdateEvent;

type IdentifyData = {
    id: string;
    traits?: Record<string, any>;
};

interface PageData {
    name: PageName;
    category?: CategoryName;
    type?: PageType;
}

interface SectionData {
    name: SectionName;
}

interface TrackingData {
    rudder?: typeof rudderSDK;
    page?: PageData;
    section?: SectionData;
}

export interface TrackingActions {
    track: (event: EventData) => void;
    page: (event: PageData) => void;
    identify: (event: IdentifyData) => void;
}

type TrackingContext = { data: TrackingData } & TrackingActions;

const Context = createContext<TrackingContext>(undefined as any);

const LIGHTDASH_APP_NAME = 'lightdash_webapp';

const TrackingProviderMain: FC<React.PropsWithChildren<TrackingData>> = ({
    rudder,
    page: pageContext,
    section: sectionContext,
    children,
}) => {
    const { health } = useApp();
    const [rudderAnalytics, setRudderAnalytics] = useState<typeof rudderSDK>();

    const {
        mode,
        version,
        rudder: { writeKey, dataPlaneUrl },
    } = health.data || { rudder: {} };

    const appContext = useMemo<rudderSDK.apiObject>(
        () =>
            ({
                namespace: 'lightdash',
                name: LIGHTDASH_APP_NAME,
                version,
                build: version,
            } as any as rudderSDK.apiObject),
        [version],
    );

    const getLightdashPageProperties = useCallback(
        ({ name, category, type = PageType.PAGE }: Partial<PageData> = {}) => ({
            name,
            category,
            type,
            hostname: window.location.hostname,
            url: null,
            path: null,
            referrer: null,
            initial_referrer: null,
            search: null,
            tab_url: null,
        }),
        [],
    );

    const lightdashContext = useMemo<rudderSDK.apiOptions>(
        () => ({
            app: appContext as any as rudderSDK.apiObject,
            page: getLightdashPageProperties(
                pageContext,
            ) as any as rudderSDK.apiObject,
        }),
        [appContext, pageContext, getLightdashPageProperties],
    );

    useEffect(() => {
        if (rudder) {
            setRudderAnalytics(rudder);
        } else if (writeKey && dataPlaneUrl) {
            rudderSDK.load(writeKey, dataPlaneUrl);
            rudderSDK.ready(() => {
                setRudderAnalytics(rudderSDK);
            });
        }
    }, [rudder, writeKey, dataPlaneUrl]);

    const page = useCallback(
        (rudderPageEvent: PageData): void => {
            const newPageContext = getLightdashPageProperties(rudderPageEvent);
            rudderAnalytics?.page(
                rudderPageEvent.category,
                rudderPageEvent.name,
                newPageContext as any as rudderSDK.apiObject,
                {
                    ...lightdashContext,
                    page: newPageContext,
                } as any as rudderSDK.apiOptions,
            );
        },
        [rudderAnalytics, lightdashContext, getLightdashPageProperties],
    );

    const track = useCallback(
        ({ name, properties = {} }: EventData): void => {
            rudderAnalytics?.track(
                `${LIGHTDASH_APP_NAME}.${name}`,
                properties,
                {
                    ...lightdashContext,
                    section: sectionContext,
                } as rudderSDK.apiOptions,
            );
        },
        [rudderAnalytics, sectionContext, lightdashContext],
    );
    const identify = useCallback(
        ({ id, traits }: IdentifyData) => {
            if (mode && mode !== LightdashMode.DEMO) {
                rudderAnalytics?.identify(id, traits, lightdashContext);
            }
        },
        [lightdashContext, mode, rudderAnalytics],
    );

    const context = useMemo(
        () => ({
            data: {
                rudder: rudderAnalytics,
                page: pageContext,
                section: sectionContext,
            },
            page,
            track,
            identify,
        }),
        [rudderAnalytics, pageContext, sectionContext, page, track, identify],
    );
    return (
        <Context.Provider value={context}>{children || null}</Context.Provider>
    );
};

interface TrackingProviderProps extends TrackingData {
    enabled?: boolean;
}

export const TrackingProvider: FC<
    React.PropsWithChildren<TrackingProviderProps>
> = ({ children, enabled = true, ...rest }) => {
    if (enabled) {
        return (
            <TrackingProviderMain {...rest}>{children}</TrackingProviderMain>
        );
    } else {
        return <>{children}</>;
    }
};

export function useTracking<S extends boolean = false>(
    failSilently?: S,
): S extends false ? TrackingContext : TrackingContext | undefined {
    const context = useContext(Context);

    if (context === undefined && failSilently !== true) {
        throw new Error('useTracking must be used within a TrackingProvider');
    }

    return context;
}

const NestedTrackingProvider: FC<
    React.PropsWithChildren<Partial<TrackingData>>
> = ({ children, ...rest }) => (
    <Context.Consumer>
        {({ data }) => (
            <TrackingProvider {...{ ...data, ...rest }}>
                {children || null}
            </TrackingProvider>
        )}
    </Context.Consumer>
);

export const TrackPage: FC<React.PropsWithChildren<PageData>> = ({
    children,
    ...rest
}) => {
    const { page } = useTracking();

    useEffect(() => {
        page(rest);
    }, [page, rest]);

    return (
        <NestedTrackingProvider page={rest}>
            {children || null}
        </NestedTrackingProvider>
    );
};

export const TrackSection: FC<React.PropsWithChildren<SectionData>> = memo(
    ({ children, name }) => {
        const section = useMemo(() => ({ name }), [name]);
        return (
            <NestedTrackingProvider section={section}>
                {children || null}
            </NestedTrackingProvider>
        );
    },
);

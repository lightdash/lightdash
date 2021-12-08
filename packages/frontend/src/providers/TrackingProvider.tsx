import { LightdashMode } from 'common';
import React, {
    createContext,
    FC,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import * as rudderSDK from 'rudder-sdk-js';
import {
    CategoryName,
    EventName,
    PageName,
    PageType,
    SectionName,
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
        | EventName.SHOW_LINEAGE_BUTTON_CLICKED
        | EventName.CREATE_PROJECT_BUTTON_CLICKED
        | EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED
        | EventName.UPDATE_PROJECT_TABLES_CONFIGURATION_BUTTON_CLICKED
        | EventName.UPDATE_PROJECT_BUTTON_CLICKED
        | EventName.UPDATE_TABLE_CALCULATION_BUTTON_CLICKED
        | EventName.CREATE_TABLE_CALCULATION_BUTTON_CLICKED;
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
            | 'connect_project';
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

type EventData =
    | GenericEvent
    | SetupStepClickedEvent
    | DocumentationClickedEvent
    | OnboardingStepClickedEvent;

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

export const TrackingProvider: FC<TrackingData> = ({
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

    const appContext = useMemo(
        () => ({
            namespace: 'lightdash',
            name: LIGHTDASH_APP_NAME,
            version,
            build: version,
        }),
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
        }),
        [],
    );

    const lightdashContext = useMemo(
        () => ({
            app: appContext,
            page: getLightdashPageProperties(pageContext),
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
                newPageContext,
                {
                    ...lightdashContext,
                    page: newPageContext,
                },
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
                },
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

export function useTracking(): TrackingContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error('useTracking must be used within a TrackingProvider');
    }
    return context;
}

const NestedTrackingProvider: FC<Partial<TrackingData>> = ({
    children,
    ...rest
}) => (
    <Context.Consumer>
        {({ data }) => (
            <TrackingProvider {...{ ...data, ...rest }}>
                {children || null}
            </TrackingProvider>
        )}
    </Context.Consumer>
);

export const Page: FC<PageData> = ({ children, ...rest }) => {
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

export const Section: FC<SectionData> = ({ children, ...rest }) => (
    <NestedTrackingProvider section={rest}>
        {children || null}
    </NestedTrackingProvider>
);

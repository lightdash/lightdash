import { LightdashMode } from '@lightdash/common';
import {
    createContext,
    FC,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import * as rudderSDK from 'rudder-sdk-js';
import { PageType } from '../../types/Events';
import { useApp } from '../AppProvider/useApp';
import {
    EventData,
    IdentifyData,
    PageData,
    TrackingActions,
    TrackingData,
} from './types';

export type TrackingContext = { data: TrackingData } & TrackingActions;

export const Context = createContext<TrackingContext>(undefined as any);

const LIGHTDASH_APP_NAME = 'lightdash_webapp';

const TrackingProviderMain: FC<TrackingData> = ({
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

export const TrackingProvider: FC<TrackingProviderProps> = ({
    children,
    enabled = true,
    ...rest
}) => {
    if (enabled) {
        return (
            <TrackingProviderMain {...rest}>{children}</TrackingProviderMain>
        );
    } else {
        return <>{children}</>;
    }
};

export const NestedTrackingProvider: FC<Partial<TrackingData>> = ({
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

import { LightdashMode } from '@lightdash/common';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import * as rudderSDK from 'rudder-sdk-js';
import { PageType } from '../../types/Events';
import useApp from '../App/useApp';
import { LIGHTDASH_APP_NAME } from './constants';
import TrackingContext from './context';
import {
    type EventData,
    type IdentifyData,
    type PageData,
    type SectionData,
    type TrackingData,
} from './types';
import useTracking from './useTracking';

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
        <TrackingContext.Provider value={context}>
            {children || null}
        </TrackingContext.Provider>
    );
};

interface TrackingProviderProps extends TrackingData {
    enabled?: boolean;
}

const TrackingProvider: FC<React.PropsWithChildren<TrackingProviderProps>> = ({
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

const NestedTrackingProvider: FC<
    React.PropsWithChildren<Partial<TrackingData>>
> = ({ children, ...rest }) => (
    <TrackingContext.Consumer>
        {({ data }) => (
            <TrackingProvider {...{ ...data, ...rest }}>
                {children || null}
            </TrackingProvider>
        )}
    </TrackingContext.Consumer>
);

export const TrackPage: FC<React.PropsWithChildren<PageData>> = ({
    children,
    ...rest
}) => {
    const { page } = useTracking();

    const pageData = useMemo(
        () => ({
            name: rest.name,
            category: rest.category,
            type: rest.type,
        }),
        [rest.name, rest.category, rest.type],
    );

    useEffect(() => {
        page(pageData);
    }, [page, pageData]);

    return (
        <NestedTrackingProvider page={pageData}>
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

export default TrackingProvider;

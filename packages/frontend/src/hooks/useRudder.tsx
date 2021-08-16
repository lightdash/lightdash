import { useEffect, useMemo, useState } from 'react';
import * as rudderSDK from 'rudder-sdk-js';
import { LightdashMode } from 'common';

type PageType = 'page' | 'modal';

type RudderTrackEvent = {
    name: string;
    page: RudderPageEvent;
    sectionName?: string | undefined;
    properties?: Record<string, any>;
};

type RudderPageEvent = {
    name: string;
    category?: string | undefined;
    type?: PageType;
};

type RudderIdentifyEvent = {
    id: string;
    traits?: Record<string, any>;
    page: RudderPageEvent;
};

export type Rudder = {
    track: (event: RudderTrackEvent) => void;
    page: (event: RudderPageEvent) => void;
    identify: (event: RudderIdentifyEvent) => void;
};

export const useRudder = (
    lightdashMode: LightdashMode | undefined,
    appVersion: string | undefined,
    writeKey: string | undefined,
    dataPlaneUrl: string | undefined,
): Rudder => {
    const [rudderAnalytics, setRudderAnalytics] = useState<typeof rudderSDK>();
    useEffect(() => {
        if (writeKey && dataPlaneUrl) {
            rudderSDK.load(writeKey, dataPlaneUrl);
            rudderSDK.ready(() => {
                setRudderAnalytics(rudderSDK);
            });
        }
    }, [writeKey, dataPlaneUrl]);

    const rudder = useMemo(() => {
        const lightdashApp = {
            namespace: 'lightdash',
            name: 'lightdash_webapp',
            version: appVersion,
            build: appVersion,
        };
        const lightdashPageProperties = ({
            name,
            category,
            type = 'page',
        }: RudderPageEvent) => ({
            name,
            category,
            type,
            hostname: window.location.hostname,
            url: null,
            path: null,
            referrer: null,
            initial_referrer: null,
            search: null,
        });
        const lightdashContext = (rudderPageEvent: RudderPageEvent) => ({
            app: lightdashApp,
            page: lightdashPageProperties(rudderPageEvent),
        });

        const page = (rudderPageEvent: RudderPageEvent): void => {
            rudderAnalytics?.page(
                rudderPageEvent.category,
                rudderPageEvent.name,
                lightdashPageProperties(rudderPageEvent),
                lightdashContext(rudderPageEvent),
            );
        };
        const track = ({
            name,
            sectionName = undefined,
            page: pageEvent,
            properties = {},
        }: RudderTrackEvent): void => {
            const context = lightdashContext(pageEvent);
            rudderAnalytics?.track(`${lightdashApp.name}.${name}`, properties, {
                ...context,
                section: {
                    name: sectionName,
                },
            });
        };
        const identify = ({
            id,
            page: pageEvent,
            traits,
        }: RudderIdentifyEvent) => {
            if (lightdashMode && lightdashMode !== LightdashMode.DEMO) {
                rudderAnalytics?.identify(
                    id,
                    traits,
                    lightdashContext(pageEvent),
                );
            }
        };

        return {
            identify,
            page,
            track,
        };
    }, [rudderAnalytics, appVersion, lightdashMode]);

    return rudder;
};

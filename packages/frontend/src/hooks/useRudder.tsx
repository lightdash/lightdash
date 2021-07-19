import { useEffect, useMemo, useState } from 'react';
import * as rudderSDK from 'rudder-sdk-js';
import { LightdashMode } from 'common';

export const useRudder = (
    lightdashMode: LightdashMode | undefined,
    appVersion: string | undefined,
    writeKey: string | undefined,
    dataPlaneUrl: string | undefined,
) => {
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
        const lightdashPageProperties = () => ({
            hostname: window.location.hostname,
            url: null,
            path: null,
            referrer: null,
            initial_referrer: null,
            search: null,
        });
        const lightdashContext = () => ({
            app: lightdashApp,
            page: lightdashPageProperties(),
        });

        const page: typeof rudderSDK.page = (category, name) => {
            rudderAnalytics?.page(
                category,
                name,
                lightdashPageProperties(),
                lightdashContext(),
            );
        };
        const track: typeof rudderSDK.track = (event, properties) => {
            rudderAnalytics?.track(event, properties, lightdashContext());
        };
        const identify: typeof rudderSDK.identify = (id, traits) => {
            if (lightdashMode && lightdashMode !== LightdashMode.DEMO) {
                rudderAnalytics?.identify(id, traits, lightdashContext());
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

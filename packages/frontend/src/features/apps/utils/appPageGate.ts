import { DATA_APP_VIZ_TEMPLATE } from '@lightdash/common';

export type AppPageGate =
    | { kind: 'wait' }
    | { kind: 'home' }
    | { kind: 'chartTypeBuilder'; appUuidOrSlug: string }
    | { kind: 'dataApp' };

type AppPageGateInput = {
    isDataAppsFlagLoading: boolean;
    isDataAppsEnabled: boolean;
    isChartStudioAvailable: boolean;
    urlAppUuid: string | undefined;
    isLoadingApp: boolean;
    app: {
        appUuid: string;
        slug: string | null;
        template: string | null;
    } | null;
};

/**
 * Decides what the app page shows before it renders: chart types open in
 * their builder when Chart Studio is available, everything else needs data apps.
 */
export const getAppPageGate = ({
    isDataAppsFlagLoading,
    isDataAppsEnabled,
    isChartStudioAvailable,
    urlAppUuid,
    isLoadingApp,
    app,
}: AppPageGateInput): AppPageGate => {
    if (isDataAppsFlagLoading) return { kind: 'wait' };
    if (!isDataAppsEnabled && !isChartStudioAvailable) return { kind: 'home' };
    // The template decides the redirect, and the manage check needs the app.
    if (urlAppUuid && isLoadingApp) return { kind: 'wait' };
    if (urlAppUuid && app?.template === DATA_APP_VIZ_TEMPLATE) {
        if (!isChartStudioAvailable) return { kind: 'home' };
        return {
            kind: 'chartTypeBuilder',
            appUuidOrSlug: app.slug ?? app.appUuid,
        };
    }
    if (!isDataAppsEnabled) return { kind: 'home' };
    return { kind: 'dataApp' };
};

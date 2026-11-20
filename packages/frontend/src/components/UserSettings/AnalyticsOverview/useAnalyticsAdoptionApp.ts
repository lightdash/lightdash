import { getVisiblePreviewTokenError } from '../../../features/apps/hooks/previewTokenQueryOptions';
import { useAppPreviewToken } from '../../../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../../../features/apps/hooks/useGetApp';

const ADOPTION_APP_SLUG = 'analytics-project-adoption-app';

// The app is only there where data apps are switched on and its build has finished. Everywhere else the tab falls
// back to its charts, so the state is worked out once, by the page.
export type AnalyticsAdoptionApp =
    | { status: 'loading' | 'unavailable' }
    | { status: 'ready'; appUuid: string; version: number; token: string };

// Nothing is looked up until the tab is first opened
export const useAnalyticsAdoptionApp = (
    projectUuid: string,
    enabled: boolean,
): AnalyticsAdoptionApp => {
    const app = useGetApp(enabled ? projectUuid : undefined, ADOPTION_APP_SLUG);
    const latest = app.data?.pages[0];
    const appUuid = latest?.appUuid;
    const version = latest?.latestReadyVersion ?? undefined;
    const preview = useAppPreviewToken(
        projectUuid,
        appUuid,
        version,
        'standalone',
    );
    // A missing app fails at once; the retries that follow are not worth making people wait for
    if (app.isError || app.failureCount > 0) return { status: 'unavailable' };
    if (app.isLoading) return { status: 'loading' };
    if (!appUuid || version === undefined) return { status: 'unavailable' };
    if (getVisiblePreviewTokenError(preview.error, !!preview.data))
        return { status: 'unavailable' };
    if (!preview.data) {
        return { status: preview.isLoading ? 'loading' : 'unavailable' };
    }
    return { status: 'ready', appUuid, version, token: preview.data };
};

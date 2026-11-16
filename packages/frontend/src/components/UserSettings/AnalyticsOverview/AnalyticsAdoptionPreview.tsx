import { ActionIcon, Box, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useLayoutEffect, useState } from 'react';
import { Link } from 'react-router';
import AppIframePreview from '../../../features/apps/AppIframePreview';
import { getVisiblePreviewTokenError } from '../../../features/apps/hooks/previewTokenQueryOptions';
import { useAppPreviewToken } from '../../../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../../../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../../../features/apps/previewOrigin';
import { dataAppHref } from '../../../features/apps/utils/appUrls';
import MantineIcon from '../../common/MantineIcon';

const ADOPTION_APP_SLUG = 'analytics-project-adoption-app';

// The app is only there where data apps are switched on and its build has finished. Everywhere else the tab falls
// back to its charts, so the state is worked out once, by the page.
export type AnalyticsAdoptionApp =
    | { status: 'loading' | 'unavailable' }
    | { status: 'ready'; appUuid: string; version: number; token: string };

export const useAnalyticsAdoptionApp = (
    projectUuid: string,
): AnalyticsAdoptionApp => {
    const app = useGetApp(projectUuid, ADOPTION_APP_SLUG);
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

export const AnalyticsAdoptionLink = ({
    projectUuid,
    appUuid,
}: {
    projectUuid: string;
    appUuid: string;
}) => (
    <Tooltip label="Open Adoption app">
        <ActionIcon
            component={Link}
            to={dataAppHref(projectUuid, appUuid)}
            target="_blank"
            rel="noreferrer"
            variant="default"
            size="sm"
            aria-label="Open Adoption app"
        >
            <MantineIcon icon={IconExternalLink} />
        </ActionIcon>
    </Tooltip>
);

const MIN_APP_HEIGHT = 480;
const APP_BOTTOM_GAP = 16;

// The height left in the window below where the box starts, so the app fits on screen without scrolling the page
// While the box is hidden its place on the page means nothing, so the last height is kept
const useRemainingHeight = (active: boolean) => {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const [height, setHeight] = useState(MIN_APP_HEIGHT);
    useLayoutEffect(() => {
        if (!element || !active) return undefined;
        const measure = () =>
            setHeight(
                Math.max(
                    MIN_APP_HEIGHT,
                    Math.round(
                        window.innerHeight -
                            element.getBoundingClientRect().top -
                            APP_BOTTOM_GAP,
                    ),
                ),
            );
        measure();
        window.addEventListener('resize', measure);
        // The box moves when anything above it changes height, which resizes the
        // boxes that contain both, so every ancestor is watched
        const observer = new ResizeObserver(measure);
        for (
            let ancestor = element.parentElement;
            ancestor;
            ancestor = ancestor.parentElement
        ) {
            observer.observe(ancestor);
        }
        return () => {
            window.removeEventListener('resize', measure);
            observer.disconnect();
        };
    }, [element, active]);
    return { ref: setElement, height };
};

export const AnalyticsAdoptionPreview = ({
    projectUuid,
    app,
    active = true,
}: {
    projectUuid: string;
    app: Extract<AnalyticsAdoptionApp, { status: 'ready' }>;
    active?: boolean;
}) => {
    const origin = usePreviewOrigin();
    const fit = useRemainingHeight(active);
    return (
        <Box ref={fit.ref} h={fit.height} pos="relative">
            <AppIframePreview
                src={`${origin}/api/apps/${app.appUuid}/versions/${app.version}/t/${app.token}/#transport=postMessage&projectUuid=${projectUuid}`}
                previewToken={app.token}
                expectedPreviewOrigin={origin}
                projectUuid={projectUuid}
                appUuid={app.appUuid}
                identityKey={app.appUuid}
                urlStateSync
            />
        </Box>
    );
};

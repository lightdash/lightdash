import { ActionIcon, Alert, Box, Center, Loader, Tooltip } from '@mantine/core';
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

export const AnalyticsAdoptionLink = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const app = useGetApp(projectUuid, ADOPTION_APP_SLUG);
    const appUuid = app.data?.pages[0]?.appUuid;

    if (!appUuid) return null;

    return (
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
};

const MIN_APP_HEIGHT = 480;
const APP_BOTTOM_GAP = 16;

// The height left in the window below where the box starts, so the app fits on screen without scrolling the page
const useRemainingHeight = () => {
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const [height, setHeight] = useState(MIN_APP_HEIGHT);
    useLayoutEffect(() => {
        if (!element) return undefined;
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
        // Catches the page above the box changing height, which moves the box
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        if (element.parentElement) observer.observe(element.parentElement);
        return () => {
            window.removeEventListener('resize', measure);
            observer.disconnect();
        };
    }, [element]);
    return { ref: setElement, height };
};

export const AnalyticsAdoptionPreview = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
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
    const origin = usePreviewOrigin();
    const fit = useRemainingHeight();

    if (
        app.isError ||
        getVisiblePreviewTokenError(preview.error, !!preview.data)
    ) {
        return <Alert color="red">Could not open the Adoption app.</Alert>;
    }

    if (app.isLoading || (version !== undefined && preview.isLoading)) {
        return (
            <Center h={480} role="status" aria-label="Loading Adoption app">
                <Loader size="sm" />
            </Center>
        );
    }

    if (!appUuid || version === undefined || !preview.data) {
        return (
            <Alert color="gray">
                The Adoption app has no ready version yet.
            </Alert>
        );
    }

    return (
        <Box ref={fit.ref} h={fit.height} pos="relative">
            <AppIframePreview
                src={`${origin}/api/apps/${appUuid}/versions/${version}/t/${preview.data}/#transport=postMessage&projectUuid=${projectUuid}`}
                previewToken={preview.data}
                expectedPreviewOrigin={origin}
                projectUuid={projectUuid}
                appUuid={appUuid}
                identityKey={appUuid}
                urlStateSync
            />
        </Box>
    );
};

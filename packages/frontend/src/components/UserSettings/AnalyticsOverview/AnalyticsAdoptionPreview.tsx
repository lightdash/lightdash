import { ActionIcon, Alert, Box, Center, Loader, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
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
        <Box h="max(760px, 82vh)" pos="relative">
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

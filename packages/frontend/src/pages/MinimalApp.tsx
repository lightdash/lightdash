import { FeatureFlags } from '@lightdash/common';
import { Box, Loader, Stack, Text } from '@mantine-8/core';
import { IconAppsOff } from '@tabler/icons-react';
import { Navigate, useParams } from 'react-router';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../features/apps/previewOrigin';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

/**
 * Chrome-stripped variant of AppPreviewTest used by the headless browser
 * for scheduled-delivery screenshots. Always renders the latest ready
 * version — no version pinning, consistent with chart/dashboard schedulers.
 */
export default function MinimalApp() {
    const { projectUuid, appUuid } = useParams<{
        projectUuid: string;
        appUuid: string;
    }>();

    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

    const appQuery = useGetApp(projectUuid, appUuid);
    const latestReadyVersion = appQuery.data?.pages[0]?.versions.find(
        (v) => v.status === 'ready',
    )?.version;

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, latestReadyVersion);

    const previewOrigin = usePreviewOrigin();

    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }
    if (!projectUuid || !appUuid) {
        return <div>Missing route params</div>;
    }

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        tokenError?.error?.statusCode === 403;
    if (isForbidden) {
        return <ForbiddenPanel />;
    }

    const isNotFound =
        appQuery.error?.error?.statusCode === 404 ||
        tokenError?.error?.statusCode === 404;
    if (isNotFound) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    icon={IconAppsOff}
                    title="Data app not found"
                    description="This data app doesn't exist or has been deleted."
                />
            </Box>
        );
    }

    if (!appQuery.isLoading && !appQuery.error && !latestReadyVersion) {
        return (
            <Stack align="center" justify="center" h="100vh">
                <Text c="red" size="sm">
                    No ready version found for this app
                </Text>
            </Stack>
        );
    }

    const isLoading =
        appQuery.isLoading ||
        (latestReadyVersion !== undefined && isTokenLoading);
    const error = appQuery.error ?? tokenError;

    if (isLoading) {
        return (
            <Stack align="center" justify="center" h="100vh">
                <Loader size="md" />
            </Stack>
        );
    }
    if (error) {
        return (
            <Stack align="center" justify="center" h="100vh">
                <Text c="red" size="sm">
                    Failed to load app:{' '}
                    {error instanceof Error ? error.message : 'Unknown error'}
                </Text>
            </Stack>
        );
    }

    const previewUrl = token
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${latestReadyVersion}/?token=${token}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;
    if (!previewUrl) return null;

    return (
        <Box pos="relative" h="100vh" w="100%">
            <AppIframePreview
                src={previewUrl}
                expectedPreviewOrigin={previewOrigin}
                identityKey={`${appUuid}:${latestReadyVersion}`}
            />
        </Box>
    );
}

import { Box, Loader, Stack } from '@mantine-8/core';
import { IconAppsOff } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import AppIframePreview from '../../../../../features/apps/AppIframePreview';
import { useEmbedAppPreviewToken } from '../../../../../features/apps/hooks/useEmbedAppPreviewToken';
import { usePreviewOrigin } from '../../../../../features/apps/previewOrigin';

type Props = {
    appUuid: string;
    projectUuid: string;
};

/**
 * Standalone (no-dashboard) embed of a single data app — the EmbedDataAppTile
 * render path minus the TileBase chrome and the dashboard-filter plumbing. The
 * preview token is minted via the embed endpoint (self-authorized by the
 * `dataApp` JWT); the sandboxed iframe + postMessage bridge are identical.
 */
const EmbedApp: FC<Props> = ({ appUuid, projectUuid }) => {
    const previewOrigin = usePreviewOrigin();
    const tokenQuery = useEmbedAppPreviewToken(projectUuid, appUuid);

    const previewUrl = tokenQuery.data
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${tokenQuery.data.version}/t/${tokenQuery.data.token}/#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    const statusCode = tokenQuery.error?.error?.statusCode;
    const isNotFound = statusCode === 404;
    const isForbidden = statusCode === 403;

    return (
        <Box h="100vh" w="100%">
            {isNotFound ? (
                <SuboptimalState
                    icon={IconAppsOff}
                    title="Data app not available"
                    description="This data app no longer exists or hasn't finished building yet."
                />
            ) : isForbidden ? (
                <SuboptimalState
                    icon={IconAppsOff}
                    title="No access"
                    description="This data app isn't authorized for this embed."
                />
            ) : tokenQuery.isLoading || !previewUrl ? (
                <Stack align="center" justify="center" h="100%">
                    <Loader size="sm" />
                </Stack>
            ) : (
                <AppIframePreview
                    src={previewUrl}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    identityKey={`${appUuid}:${tokenQuery.data!.version}`}
                    dashboardFilters={undefined}
                />
            )}
        </Box>
    );
};

export default EmbedApp;

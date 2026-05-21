import { type DashboardDataAppTile } from '@lightdash/common';
import { Box, Loader, Stack } from '@mantine-8/core';
import { IconAppsOff } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import TileBase from '../../../../../components/DashboardTiles/TileBase';
import AppIframePreview from '../../../../../features/apps/AppIframePreview';
import { useEmbedAppPreviewToken } from '../../../../../features/apps/hooks/useEmbedAppPreviewToken';
import { usePreviewOrigin } from '../../../../../features/apps/previewOrigin';
import useDashboardFiltersForTile from '../../../../../hooks/dashboard/useDashboardFiltersForTile';
import { convertDateDashboardFilters } from '../../../../../utils/dateFilter';

type Props = {
    tile: DashboardDataAppTile;
    projectUuid: string;
};

/**
 * Embed-mode counterpart to `DashboardDataAppTile`. Mints the preview token
 * via the embed-specific endpoint (which gates on the embed's dashboard
 * allowlist) and stamps tile-scoped dashboard filters onto the iframe URL
 * the same way as the non-embed tile.
 *
 * Unlike the non-embed tile, this one has no edit menu, no comments, no
 * preview-project detection, and no per-user ability checks. Cross-project
 * apps (preview environments) surface as a backend 404 — rendered here as
 * the "Data app not available" placeholder.
 */
const EmbedDataAppTile: FC<Props> = ({ tile, projectUuid }) => {
    const {
        properties: { title, appUuid, appDeletedAt },
        uuid,
    } = tile;

    const tileDashboardFilters = useDashboardFiltersForTile(uuid);
    const dashboardFiltersForApp = useMemo(
        () => convertDateDashboardFilters(tileDashboardFilters),
        [tileDashboardFilters],
    );

    const previewOrigin = usePreviewOrigin();
    // Skip the round-trip when the backend already flagged the app as gone.
    const shouldFetch = !!projectUuid && !!appUuid && !appDeletedAt;
    const tokenQuery = useEmbedAppPreviewToken(
        shouldFetch ? projectUuid : undefined,
        shouldFetch ? appUuid : undefined,
    );

    // Bumping the URL whenever filters change forces the iframe to remount so
    // its mount-time metric queries re-fire — matching DashboardDataAppTile.
    const filtersKey = useMemo(
        () => JSON.stringify(dashboardFiltersForApp),
        [dashboardFiltersForApp],
    );

    const previewUrl = tokenQuery.data
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${tokenQuery.data.version}/?token=${tokenQuery.data.token}&f=${encodeURIComponent(
              filtersKey,
          )}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    const statusCode = tokenQuery.error?.error?.statusCode;
    const isNotFound = !!appDeletedAt || statusCode === 404;
    const isForbidden = statusCode === 403;

    return (
        <TileBase
            tile={tile}
            title={title}
            isEditMode={false}
            onDelete={() => {}}
            onEdit={() => {}}
        >
            <Box className="non-draggable" style={{ flex: 1, minHeight: 0 }}>
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
                        identityKey={`${appUuid}:${tokenQuery.data!.version}`}
                        dashboardFilters={dashboardFiltersForApp}
                    />
                )}
            </Box>
        </TileBase>
    );
};

export default EmbedDataAppTile;

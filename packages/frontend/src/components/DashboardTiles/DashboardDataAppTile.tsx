import { subject } from '@casl/ability';
import { type DashboardDataAppTile } from '@lightdash/common';
import { Box, Loader, Stack, Text } from '@mantine-8/core';
import { IconAppsOff, IconPencil } from '@tabler/icons-react';
import React, { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import { DashboardTileComments } from '../../features/comments';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import TileBase from './TileBase/index';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardDataAppTile };

const DataAppTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, appUuid, appDeletedAt },
            uuid,
        },
    } = props;
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState(false);
    const showComments = useDashboardContext(
        (c) => c.dashboardCommentsCheck?.canViewDashboardComments,
    );
    const tileHasComments = useDashboardContext((c) => c.hasTileComments(uuid));
    const dashboardComments = useMemo(
        () =>
            !!showComments && (
                <DashboardTileComments
                    opened={isCommentsMenuOpen}
                    onOpen={() => setIsCommentsMenuOpen(true)}
                    onClose={() => setIsCommentsMenuOpen(false)}
                    dashboardTileUuid={uuid}
                />
            ),
        [showComments, isCommentsMenuOpen, uuid],
    );

    const previewOrigin = usePreviewOrigin();
    // Skip the network calls when the backend already told us the app is
    // gone — `useGetApp` would 404 anyway, but bypassing the request avoids
    // a noisy log entry and a wasted round trip on every dashboard load.
    const shouldFetch = !!projectUuid && !!appUuid && !appDeletedAt;
    const appQuery = useGetApp(
        shouldFetch ? projectUuid : undefined,
        shouldFetch ? appUuid : undefined,
    );

    const latestReadyVersion = appQuery.data?.pages[0]?.versions.find(
        (v) => v.status === 'ready',
    )?.version;

    // Mirror the "Continue building" affordance from the app preview page
    // (AppPreviewTest.tsx) — same space-aware ability check.
    const { user } = useApp();
    const appSpaceUuid = appQuery.data?.pages[0]?.spaceUuid ?? null;
    const appCreatedByUserUuid =
        appQuery.data?.pages[0]?.createdByUserUuid ?? null;
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const userSpaceAccess = appSpaceUuid
        ? spaces.find((s) => s.uuid === appSpaceUuid)?.userAccess
        : undefined;
    const canEditApp =
        !!appQuery.data &&
        user.data?.ability?.can(
            'manage',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                access: userSpaceAccess ? [userSpaceAccess] : [],
                createdByUserUuid: appCreatedByUserUuid,
            }),
        ) === true;

    const editMenuItem = canEditApp ? (
        <LinkMenuItem
            leftSection={<MantineIcon icon={IconPencil} />}
            href={`/projects/${projectUuid}/apps/${appUuid}`}
        >
            Continue building
        </LinkMenuItem>
    ) : null;

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, latestReadyVersion);

    const previewUrl =
        token && latestReadyVersion
            ? `${previewOrigin}/api/apps/${appUuid}/versions/${latestReadyVersion}/?token=${token}#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        tokenError?.error?.statusCode === 403;
    const isNotFound =
        appDeletedAt ||
        appQuery.error?.error?.statusCode === 404 ||
        tokenError?.error?.statusCode === 404;
    const hasNoReadyVersion =
        !appQuery.isLoading && !appQuery.error && !latestReadyVersion;
    const isLoading =
        appQuery.isLoading ||
        (latestReadyVersion !== undefined && isTokenLoading);
    const otherError =
        !isForbidden && !isNotFound && (appQuery.error || tokenError);

    return (
        <TileBase
            title={title}
            lockHeaderVisibility={isCommentsMenuOpen}
            visibleHeaderElement={
                tileHasComments ? dashboardComments : undefined
            }
            extraHeaderElement={tileHasComments ? undefined : dashboardComments}
            extraMenuItems={editMenuItem}
            {...props}
        >
            <Box className="non-draggable" style={{ flex: 1, minHeight: 0 }}>
                {isNotFound ? (
                    <SuboptimalState
                        icon={IconAppsOff}
                        title="Data app not found"
                        description="This data app no longer exists. Edit the tile to pick another app."
                    />
                ) : isForbidden ? (
                    <SuboptimalState
                        icon={IconAppsOff}
                        title="No access"
                        description="You don't have permission to view this data app."
                    />
                ) : hasNoReadyVersion ? (
                    <SuboptimalState
                        icon={IconAppsOff}
                        title="No ready version"
                        description="This data app hasn't finished building yet."
                    />
                ) : otherError ? (
                    <Stack align="center" justify="center" h="100%">
                        <Text c="red" size="sm">
                            Failed to load app
                        </Text>
                    </Stack>
                ) : isLoading || !previewUrl ? (
                    <Stack align="center" justify="center" h="100%">
                        <Loader size="sm" />
                    </Stack>
                ) : (
                    <AppIframePreview
                        src={previewUrl}
                        expectedPreviewOrigin={previewOrigin}
                        identityKey={`${appUuid}:${latestReadyVersion}`}
                    />
                )}
            </Box>
        </TileBase>
    );
};

export default DataAppTile;

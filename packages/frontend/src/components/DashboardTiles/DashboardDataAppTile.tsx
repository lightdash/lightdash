import { subject } from '@casl/ability';
import {
    DimensionType,
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterTypeFromItemType,
    hashStringToBase36,
    ProjectType,
    type DashboardDataAppTile,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    HoverCard,
    Loader,
    Stack,
    Text,
} from '@mantine/core';
import { IconAppsOff, IconCode, IconFilter } from '@tabler/icons-react';
import React, { useMemo, useState, type FC } from 'react';
import { AskAiAgentButton } from '../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentButton';
import AppIframePreview from '../../features/apps/AppIframePreview';
import { getVisiblePreviewTokenError } from '../../features/apps/hooks/previewTokenQueryOptions';
import { useAppPreviewToken } from '../../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../../features/apps/previewOrigin';
import { DashboardTileComments } from '../../features/comments';
import useDashboardFiltersForTile from '../../hooks/dashboard/useDashboardFiltersForTile';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import TileBase from './TileBase/index';

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: DashboardDataAppTile };

const DashboardFiltersIndicator: FC<{
    filterRules: DashboardFilterRule[];
    filterableItems: Record<string, FilterableItem>;
}> = ({ filterRules, filterableItems }) => {
    if (filterRules.length === 0) return null;

    const labelledRules = filterRules.map((filterRule) => {
        const filterableItem = filterableItems[filterRule.target.fieldId];
        const labels = filterableItem
            ? getConditionalRuleLabelFromItem(filterRule, filterableItem)
            : getConditionalRuleLabel(
                  filterRule,
                  getFilterTypeFromItemType(
                      filterRule.target.fallbackType ?? DimensionType.STRING,
                  ),
                  filterRule.label ?? filterRule.target.fieldId,
              );

        return { filterRule, labels };
    });

    const availableFiltersLabel = `${filterRules.length} dashboard filter${
        filterRules.length === 1 ? '' : 's'
    } available to this Data App`;

    return (
        <HoverCard withArrow position="bottom-end" offset={4} arrowOffset={10}>
            <HoverCard.Dropdown>
                <Stack gap="xs" align="flex-start">
                    <Text c="ldGray.7" fw={500} fz="xs">
                        Dashboard filter{filterRules.length === 1 ? '' : 's'}{' '}
                        available to this Data App:
                    </Text>
                    {labelledRules.map(({ filterRule, labels }) => (
                        <Badge
                            key={filterRule.id}
                            variant="outline"
                            color="ldGray.4"
                            size="lg"
                            fz="xs"
                            fw="normal"
                        >
                            <Text fw={600} span inherit c="foreground">
                                {labels.field}:
                            </Text>{' '}
                            {filterRule.disabled ? (
                                <Text span inherit c="foreground">
                                    is any value
                                </Text>
                            ) : (
                                <>
                                    <Text span inherit c="foreground">
                                        {labels.operator}
                                    </Text>{' '}
                                    <Text fw={600} span inherit c="foreground">
                                        {labels.value}
                                    </Text>
                                </>
                            )}
                        </Badge>
                    ))}
                </Stack>
            </HoverCard.Dropdown>
            <HoverCard.Target>
                <ActionIcon aria-label={availableFiltersLabel} size="sm">
                    <MantineIcon icon={IconFilter} />
                </ActionIcon>
            </HoverCard.Target>
        </HoverCard>
    );
};

const DataAppTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { title, appUuid, appDeletedAt },
            uuid,
        },
    } = props;
    const projectUuid = useProjectUuid();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);

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

    // Tile-scoped dashboard filters (drops filters the admin disabled for
    // this tile via tileTargets). The backend additionally drops filters
    // whose target field isn't in a given query's explore — an app may
    // query multiple explores.
    const tileDashboardFilters = useDashboardFiltersForTile(uuid);
    const availableDashboardFilterRules = useMemo(
        () => [
            ...tileDashboardFilters.dimensions,
            ...tileDashboardFilters.metrics,
            ...tileDashboardFilters.tableCalculations,
        ],
        [tileDashboardFilters],
    );
    const dashboardFiltersForApp = useMemo(
        () => convertDateDashboardFilters(tileDashboardFilters),
        [tileDashboardFilters],
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const filterableItems = useMemo(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );
    const hasExtraHeaderElement =
        (!tileHasComments && !!dashboardComments) ||
        availableDashboardFilterRules.length > 0;
    const hasNonMenuHeaderContent =
        !!dashboardComments || availableDashboardFilterRules.length > 0;

    // The dashboard refresh button bumps `refreshCounter` and flips
    // `invalidateCache` (both via `clearCacheAndFetch`). Chart tiles re-fetch
    // through React Query; this iframe re-fires its mount-time queries only on
    // reload, so we bake the counter into the URL to force one, and forward
    // invalidateCache so those re-fired queries bypass the warehouse cache —
    // matching how a chart refreshes.
    const invalidateCache = useDashboardTileStatusContext(
        (c) => c.invalidateCache,
    );
    const refreshCounter = useDashboardTileStatusContext(
        (c) => c.refreshCounter,
    );

    const previewOrigin = usePreviewOrigin();
    const { data: project } = useProject(projectUuid);
    const isPreviewProject = project?.type === ProjectType.PREVIEW;
    // Skip the network calls when the backend already told us the app is
    // gone — `useGetApp` would 404 anyway, but bypassing the request avoids
    // a noisy log entry and a wasted round trip on every dashboard load.
    const shouldFetch = !!projectUuid && !!appUuid && !appDeletedAt;
    const appQuery = useGetApp(
        shouldFetch ? projectUuid : undefined,
        shouldFetch ? appUuid : undefined,
    );

    // Authoritative across ALL versions — the ready version may be older than
    // the fetched page of versions, so never scan `versions` for it.
    const latestReadyVersion =
        appQuery.data?.pages[0]?.latestReadyVersion ?? undefined;

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
            leftSection={<MantineIcon icon={IconCode} />}
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

    // Bump the iframe URL whenever the active filters change so the app
    // reloads and its mount-time metric queries re-fire — by then the bridge
    // is stamping the new filters onto every outgoing call. Without this the
    // bridge sees no new traffic until the user manually refreshes.
    //
    // Hash rather than serialize the filters: the app reads them from the
    // bridge, not this URL, and embedding the full object made the URL grow
    // with filters × tiles and 502 on large dashboards.
    const filtersKey = useMemo(
        () => hashStringToBase36(JSON.stringify(dashboardFiltersForApp)),
        [dashboardFiltersForApp],
    );

    const previewUrl =
        token && latestReadyVersion
            ? `${previewOrigin}/api/apps/${appUuid}/versions/${latestReadyVersion}/t/${token}/?f=${filtersKey}&r=${refreshCounter}#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;
    const visibleTokenError = getVisiblePreviewTokenError(tokenError, !!token);

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        visibleTokenError?.error?.statusCode === 403;
    const isNotFound =
        appDeletedAt ||
        appQuery.error?.error?.statusCode === 404 ||
        visibleTokenError?.error?.statusCode === 404;
    const hasNoReadyVersion =
        !appQuery.isLoading && !appQuery.error && !latestReadyVersion;
    const isLoading =
        appQuery.isLoading ||
        (latestReadyVersion !== undefined && isTokenLoading);
    const otherError =
        !isForbidden && !isNotFound && (appQuery.error || visibleTokenError);

    return (
        <TileBase
            title={title}
            titleLeftIcon={
                <AskAiAgentButton
                    projectUuid={projectUuid}
                    dataAppUuid={appUuid}
                    dashboardUuid={dashboardUuid}
                    clickedFrom="dashboard_data_app_tile"
                />
            }
            lockHeaderVisibility={isCommentsMenuOpen}
            visibleHeaderElement={
                tileHasComments ? dashboardComments : undefined
            }
            hasNonMenuHeaderContent={hasNonMenuHeaderContent}
            extraHeaderElement={
                hasExtraHeaderElement ? (
                    <>
                        {tileHasComments ? undefined : dashboardComments}
                        <DashboardFiltersIndicator
                            filterRules={availableDashboardFilterRules}
                            filterableItems={filterableItems}
                        />
                    </>
                ) : undefined
            }
            extraMenuItems={editMenuItem}
            {...props}
        >
            <Box className="non-draggable" flex={1} mih={0}>
                {isNotFound ? (
                    <SuboptimalState
                        icon={IconAppsOff}
                        title="Data app not available"
                        description={
                            isPreviewProject
                                ? "Data apps aren't duplicated into preview environments yet. You can however edit or remove the tile itself."
                                : 'This data app no longer exists. Edit the tile to pick another app.'
                        }
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
                ) : isLoading || !previewUrl || !token ? (
                    <Stack align="center" justify="center" h="100%">
                        <Loader size="sm" />
                    </Stack>
                ) : (
                    <AppIframePreview
                        src={previewUrl}
                        previewToken={token}
                        expectedPreviewOrigin={previewOrigin}
                        projectUuid={projectUuid ?? ''}
                        appUuid={appUuid}
                        identityKey={`${appUuid}:${latestReadyVersion}`}
                        dashboardFilters={dashboardFiltersForApp}
                        invalidateCache={invalidateCache}
                        capabilities={{ gsheetExport: true }}
                    />
                )}
            </Box>
        </TileBase>
    );
};

export default DataAppTile;

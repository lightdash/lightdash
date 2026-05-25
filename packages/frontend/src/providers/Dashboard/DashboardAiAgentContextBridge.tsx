import {
    type DashboardChartTile,
    type DashboardFilters,
    isDashboardChartTileType,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type StreamPart } from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';
import { useAiAgentStoreSelector } from '../../ee/features/aiCopilot/store/hooks';
import { getDashboard } from '../../hooks/dashboard/useDashboard';
import { getSavedQuery } from '../../hooks/useSavedQuery';
import useDashboardContext from './useDashboardContext';
import { useDashboardPageContext } from './useDashboardPageContext';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

type ToolOutput = {
    metadata?: {
        status?: 'success' | 'error';
    };
};

type ToolCallPart = Extract<StreamPart, { type: 'toolCall' }>;
type EditContentToolArgs = {
    type?: 'dashboard' | 'chart';
    slug?: string;
};

const isToolOutput = (value: unknown): value is ToolOutput =>
    typeof value === 'object' && value !== null;

const isFinalEditContentToolCall = (part: StreamPart): part is ToolCallPart =>
    part.type === 'toolCall' &&
    part.toolName === 'editContent' &&
    part.isPreliminary === false &&
    part.toolOutput !== undefined;

const getEditContentToolArgs = (
    value: unknown,
): EditContentToolArgs | undefined =>
    typeof value === 'object' && value !== null
        ? (value as EditContentToolArgs)
        : undefined;

type DashboardAiAgentContextBridgeProps = {
    threadUuid?: string;
};

const DashboardAiAgentContextBridge = ({
    threadUuid,
}: DashboardAiAgentContextBridgeProps) => {
    const queryClient = useQueryClient();
    const projectUuid = useDashboardPageContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardPageContext((c) => c.dashboardUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setOriginalDashboardFilters = useDashboardContext(
        (c) => c.setOriginalDashboardFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );

    const activeThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const resolvedThreadUuid = threadUuid ?? activeThreadId;
    const activeThreadParts = useAiAgentStoreSelector((state) =>
        resolvedThreadUuid
            ? (state.aiAgentThreadStream[resolvedThreadUuid]?.parts ?? [])
            : [],
    );

    const handledToolCallIdsRef = useRef<Set<string>>(new Set());

    const currentDashboardSlug = dashboard?.slug;
    const dashboardQueryKey = useMemo(
        () => ['saved_dashboard_query', dashboardUuid, projectUuid],
        [dashboardUuid, projectUuid],
    );

    const relevantResults = useMemo(
        () => activeThreadParts.filter(isFinalEditContentToolCall),
        [activeThreadParts],
    );

    const refreshDashboard = useCallback(async () => {
        if (!projectUuid || !dashboardUuid) return;

        console.log(
            '[DashboardAiAgentContextBridge] invalidating dashboard query',
            {
                slug: currentDashboardSlug,
                queryKey: dashboardQueryKey,
                before: {
                    tiles: dashboardTiles,
                    tabs: dashboardTabs,
                    filters: dashboardFilters,
                    temporaryFilters: dashboardTemporaryFilters,
                },
            },
        );

        const freshDashboard = await queryClient.fetchQuery({
            queryKey: dashboardQueryKey,
            queryFn: () => getDashboard(dashboardUuid, projectUuid),
        });

        console.log(
            '[DashboardAiAgentContextBridge] applying fresh dashboard state',
            {
                slug: currentDashboardSlug,
                after: {
                    tiles: freshDashboard.tiles,
                    tabs: freshDashboard.tabs,
                    filters: freshDashboard.filters,
                },
            },
        );

        setDashboardTiles(freshDashboard.tiles);
        setDashboardTabs(freshDashboard.tabs);
        setDashboardFilters(freshDashboard.filters);
        setOriginalDashboardFilters(freshDashboard.filters);
        setDashboardTemporaryFilters(emptyFilters);
    }, [
        currentDashboardSlug,
        dashboardFilters,
        dashboardQueryKey,
        dashboardTabs,
        dashboardTemporaryFilters,
        dashboardTiles,
        dashboardUuid,
        projectUuid,
        queryClient,
        setDashboardFilters,
        setDashboardTabs,
        setDashboardTemporaryFilters,
        setDashboardTiles,
        setOriginalDashboardFilters,
    ]);

    const refreshChartTiles = useCallback(
        async (chartSlug: string) => {
            if (!projectUuid || !dashboardUuid) return;

            const matchingTiles = (dashboardTiles ?? []).filter(
                (tile): tile is DashboardChartTile =>
                    isDashboardChartTileType(tile) &&
                    tile.properties.chartSlug === chartSlug &&
                    !!tile.properties.savedChartUuid,
            );

            if (matchingTiles.length === 0) return;

            const savedChartUuids = [
                ...new Set(
                    matchingTiles
                        .map((tile) => tile.properties.savedChartUuid)
                        .filter((uuid): uuid is string => !!uuid),
                ),
            ];

            console.log(
                '[DashboardAiAgentContextBridge] refreshing chart tiles',
                {
                    slug: chartSlug,
                    savedChartUuids,
                    tileUuids: matchingTiles.map((tile) => tile.uuid),
                },
            );

            await Promise.all(
                savedChartUuids.map(async (savedChartUuid) => {
                    const freshChart = await queryClient.fetchQuery({
                        queryKey: ['saved_query', savedChartUuid, projectUuid],
                        queryFn: () =>
                            getSavedQuery(savedChartUuid, projectUuid),
                    });

                    queryClient.setQueryData(
                        ['saved_query', freshChart.slug, projectUuid],
                        freshChart,
                    );
                }),
            );

            await queryClient.resetQueries({
                predicate: (query) =>
                    query.queryKey[0] === 'dashboard_chart_ready_query' &&
                    query.queryKey[2] !== null &&
                    savedChartUuids.includes(query.queryKey[2] as string) &&
                    query.queryKey[3] === dashboardUuid,
            });
        },
        [dashboardTiles, dashboardUuid, projectUuid, queryClient],
    );

    useEffect(() => {
        if (!currentDashboardSlug) return;

        for (const part of relevantResults) {
            if (handledToolCallIdsRef.current.has(part.toolCallId)) continue;

            handledToolCallIdsRef.current.add(part.toolCallId);

            const toolArgs = getEditContentToolArgs(part.toolArgs);

            if (toolArgs?.type !== 'dashboard' && toolArgs?.type !== 'chart') {
                continue;
            }

            const toolOutput = part.toolOutput;
            if (
                !isToolOutput(toolOutput) ||
                toolOutput.metadata?.status !== 'success' ||
                !projectUuid ||
                !dashboardUuid
            ) {
                continue;
            }

            switch (toolArgs.type) {
                case 'chart':
                    if (!toolArgs.slug) continue;
                    void refreshChartTiles(toolArgs.slug);
                    continue;
                case 'dashboard':
                    if (toolArgs.slug !== currentDashboardSlug) continue;
                    void refreshDashboard();
                    continue;
            }
        }
    }, [
        currentDashboardSlug,
        dashboardUuid,
        projectUuid,
        relevantResults,
        refreshChartTiles,
        refreshDashboard,
    ]);

    return null;
};

export default DashboardAiAgentContextBridge;

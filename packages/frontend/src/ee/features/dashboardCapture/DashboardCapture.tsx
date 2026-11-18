import {
    DASHBOARD_GRID_COLUMNS,
    FeatureFlags,
    isDashboardChartTileType,
    type CaptureLayoutOp,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Loader, Text, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import {
    selectActiveTabUuid,
    selectDashboardTiles,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import { getTileTitle } from '../../../features/dashboardControls/tileProps';
import {
    getDashboard,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import useToaster from '../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import launcherClasses from '../aiCopilot/components/Launcher/AiAgentsLauncher.module.css';
import { useLauncherDockExtras } from '../aiCopilot/components/Launcher/launcherDockExtras';
import { useProjectAiAgents } from '../aiCopilot/hooks/useProjectAiAgents';
import { openDefaultAgentPanel } from '../aiCopilot/store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../aiCopilot/store/hooks';
import {
    CaptureHost,
    type CaptureHostHandle,
    type CaptureResult,
    type CaptureSurface,
    type CaptureTarget,
} from '../capture';
import { buildAgentPrompt } from '../capture/buildAgentPrompt';
import {
    VOICE_DESIGN_BUTTON_TOUR_ID,
    VoiceDesignTour,
} from '../capture/onboarding';
import { applyLayoutOps } from './applyLayoutOps';
import classes from './DashboardCapture.module.css';
import { describeLayoutOps } from './describeLayoutOps';
import { hasSameLayout, reapplyLayoutPreview } from './layoutPreview';
import { buildLayoutSaveBody } from './layoutSaveBody';
import { routeCapture } from './routeCapture';
import {
    buildRouteRequest,
    cellAtPoint,
    cellTarget,
    imageToJpegBase64,
    tileTarget,
} from './routeRequest';
import { useSendCaptureToAgent } from './useSendCaptureToAgent';

const UNTITLED = 'Untitled tile';
const MAX_ROUTE_IMAGES = 5;
const MAX_CHART_CONTEXT = 3;

const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

// What is under a viewport point: a tile, or an empty cell of the grid.
const targetAtPoint = (
    point: { x: number; y: number },
    tiles: DashboardTile[],
): CaptureTarget | null => {
    for (const element of document.elementsFromPoint(point.x, point.y)) {
        const tileUuid = element
            .closest('[data-tile-uuid]')
            ?.getAttribute('data-tile-uuid');
        const tile = tiles.find((candidate) => candidate.uuid === tileUuid);
        if (tile) return tileTarget(tile.uuid, getTileTitle(tile, UNTITLED));
    }

    // Use any tile on screen to learn how tall a grid row is drawn.
    const tileElement = Array.from(
        document.querySelectorAll<HTMLElement>('[data-tile-uuid]'),
    ).find((element) => element.offsetParent !== null);
    const grid = tileElement?.closest('.react-grid-layout');
    const reference = tiles.find(
        (tile) => tile.uuid === tileElement?.getAttribute('data-tile-uuid'),
    );
    if (!tileElement || !grid || !reference || reference.h <= 0) return null;
    const gridRect = grid.getBoundingClientRect();
    if (point.x < gridRect.left || point.x > gridRect.right) return null;
    return cellTarget(
        cellAtPoint(
            point,
            gridRect,
            DASHBOARD_GRID_COLUMNS,
            tileElement.getBoundingClientRect().height / reference.h,
        ),
    );
};

/** Voice Design on a dashboard: layout is done here, questions go to an agent. */
const DashboardCapture: FC = () => {
    const { mode } = useParams<{ mode?: string }>();
    const dockExtras = useLauncherDockExtras();
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const includeUnpublishedDraft = useDashboardContext(
        (c) => c.includeUnpublishedDraft,
    );
    const lightdashApi = useLightdashApi();
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const flag = useServerFeatureFlag(FeatureFlags.DashboardCapture);
    const { health } = useApp();
    const agentDispatch = useAiAgentStoreDispatch();
    const { showToastInfo, showToastWarning, showToastError } = useToaster();

    const tilesRef = useRef<DashboardTile[]>([]);
    tilesRef.current = dashboardTiles ?? [];
    const captureRef = useRef<CaptureHostHandle>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isSorting, setIsSorting] = useState(false);
    // Unsaved layout changes on screen, in the order they were made.
    const [pendingLayoutOps, setPendingLayoutOps] = useState<CaptureLayoutOp[]>(
        [],
    );
    const [isSaving, setIsSaving] = useState(false);

    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const agentUuid = agents?.[0]?.uuid ?? null;
    const sendToAgent = useSendCaptureToAgent(projectUuid ?? '');

    const { mutateAsync: saveDashboard } = useUpdateDashboard(
        dashboard?.uuid,
        projectUuid,
    );

    // An agent edit reloads the tiles from the server, which drops the
    // unsaved layout. When the tiles match the server again, put it back.
    const serverTiles = dashboard?.tiles;
    useLayoutEffect(() => {
        if (pendingLayoutOps.length === 0 || isSaving) return;
        if (!serverTiles || !dashboardTiles) return;
        if (!hasSameLayout(dashboardTiles, serverTiles)) return;
        const preview = reapplyLayoutPreview(
            dashboardTiles,
            pendingLayoutOps,
            DASHBOARD_GRID_COLUMNS,
        );
        if (preview.ops.length !== pendingLayoutOps.length) {
            setPendingLayoutOps(preview.ops);
        }
        if (preview.ops.length > 0) setDashboardTiles(preview.tiles);
    }, [
        dashboardTiles,
        isSaving,
        pendingLayoutOps,
        serverTiles,
        setDashboardTiles,
    ]);

    // The agent gets the recording as said, in one message. The sorter only
    // decides whether it needs the agent at all.
    const sendToAgentAsSaid = useCallback(
        ({
            summary,
            tiles,
            tileUuids,
            dashboardUuid,
            dashboardName,
            layoutDone,
        }: {
            summary: string;
            tiles: DashboardTile[];
            /** Tiles the requests are about, for chart context. */
            tileUuids: string[];
            dashboardUuid: string;
            dashboardName: string;
            /** Layout changes the page made from this recording, in words. */
            layoutDone: string;
        }) => {
            const chartUuids = [
                ...new Set(
                    tiles.flatMap((tile) =>
                        tileUuids.includes(tile.uuid) &&
                        isDashboardChartTileType(tile) &&
                        tile.properties.savedChartUuid
                            ? [tile.properties.savedChartUuid]
                            : [],
                    ),
                ),
            ].slice(0, MAX_CHART_CONTEXT);
            // Screenshots are not sent to the agent yet, so the prompt keeps
            // only the lines about marks and speech.
            const prompt = buildAgentPrompt({
                heading: `These requests are about the dashboard "${dashboardName}".`,
                alreadyDone: layoutDone || undefined,
                summary,
                hasImages: false,
            });
            if (!agentUuid) {
                // No agent list yet: open a new chat with the prompt ready.
                agentDispatch(
                    openDefaultAgentPanel({
                        pendingContext: {
                            dashboardUuid,
                            chartUuid: chartUuids[0],
                        },
                        pendingPrompt: prompt,
                    }),
                );
                return;
            }
            void sendToAgent({
                agentUuid,
                prompt,
                context: [
                    { type: 'dashboard', dashboardUuid },
                    ...chartUuids.map((chartUuid) => ({
                        type: 'chart' as const,
                        chartUuid,
                    })),
                ],
            }).catch(() => {
                showToastError({
                    title: 'Could not send your requests to the agent',
                });
            });
        },
        [agentDispatch, agentUuid, sendToAgent, showToastError],
    );

    const handleCapture = useCallback(
        async (result: CaptureResult) => {
            if (!projectUuid || !dashboard) return;
            const tiles = tilesRef.current;
            const onThisTab = tiles.filter(
                (tile) => !activeTabUuid || tile.tabUuid === activeTabUuid,
            );
            setIsSorting(true);
            try {
                const images = await Promise.all(
                    result.images
                        .slice(0, MAX_ROUTE_IMAGES)
                        .map(imageToJpegBase64),
                );
                const route = await routeCapture(
                    lightdashApi,
                    projectUuid,
                    buildRouteRequest({
                        dashboardName: dashboard.name,
                        gridColumns: DASHBOARD_GRID_COLUMNS,
                        tiles: onThisTab.map((tile) => ({
                            uuid: tile.uuid,
                            title: getTileTitle(tile, UNTITLED),
                            x: tile.x,
                            y: tile.y,
                            w: tile.w,
                            h: tile.h,
                        })),
                        marks: result.marks,
                        transcript: result.transcript,
                        images,
                    }),
                );

                const layout = applyLayoutOps(
                    tilesRef.current,
                    route.layout,
                    DASHBOARD_GRID_COLUMNS,
                );
                if (layout.applied > 0) {
                    setPendingLayoutOps((ops) => [...ops, ...route.layout]);
                    setDashboardTiles(layout.tiles);
                }

                const forAgent = [...route.questions, ...route.edits];
                if (forAgent.length > 0) {
                    sendToAgentAsSaid({
                        summary: result.summary,
                        tiles,
                        tileUuids: forAgent.flatMap((item) => item.tileUuids),
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                        layoutDone:
                            layout.applied > 0
                                ? describeLayoutOps(
                                      route.layout,
                                      new Map(
                                          tiles.map((tile) => [
                                              tile.uuid,
                                              getTileTitle(tile, UNTITLED),
                                          ]),
                                      ),
                                  )
                                : '',
                    });
                }

                if (layout.applied === 0 && forAgent.length === 0) {
                    showToastWarning({
                        title: 'Nothing to do',
                        subtitle:
                            'No layout change, dashboard change or question was found in that capture.',
                    });
                    return;
                }
                const parts = [
                    layout.applied > 0
                        ? `${plural(layout.applied, 'layout change')} ready to review`
                        : null,
                    forAgent.length > 0
                        ? 'your requests sent to the agent'
                        : null,
                ].filter((part) => part !== null);
                showToastInfo({ title: parts.join(', ') });
            } catch {
                showToastError({ title: 'Could not sort that capture' });
            } finally {
                setIsSorting(false);
            }
        },
        [
            activeTabUuid,
            dashboard,
            lightdashApi,
            projectUuid,
            sendToAgentAsSaid,
            setDashboardTiles,
            showToastError,
            showToastInfo,
            showToastWarning,
        ],
    );
    const handleCaptureRef = useRef(handleCapture);
    handleCaptureRef.current = handleCapture;

    const available = Boolean(
        flag.data?.enabled && projectUuid && dashboard && mode !== 'edit',
    );
    const voiceTranscriptionAvailable =
        health.data?.ai.voiceTranscriptionAvailable;
    const surface = useMemo<CaptureSurface | null>(
        () =>
            available && projectUuid
                ? {
                      // The whole page is drawable; marks find their own tile.
                      getRegion: () =>
                          new DOMRect(
                              0,
                              0,
                              window.innerWidth,
                              window.innerHeight,
                          ),
                      // Pictures let the sorter see what was marked inside a chart.
                      captureImages: true,
                      // Drawn from the page itself, so there is no share prompt.
                      frameSource: 'dom',
                      resolveTarget: (point) =>
                          targetAtPoint(point, tilesRef.current),
                      transcribe: captureTranscriber(
                          lightdashApi,
                          projectUuid,
                          voiceTranscriptionAvailable,
                      ),
                      onCapture: (result) =>
                          void handleCaptureRef.current(result),
                  }
                : null,
        [available, lightdashApi, projectUuid, voiceTranscriptionAvailable],
    );

    if (!surface || !dashboard) return null;

    const micButton = (
        <Tooltip label="Voice Design" position="top">
            <button
                type="button"
                aria-label="Voice Design"
                data-tour={VOICE_DESIGN_BUTTON_TOUR_ID}
                className={`${launcherClasses.dockTab} ${launcherClasses.dockIconTab} ${classes.mic}`}
                onClick={() => captureRef.current?.start()}
            >
                <MantineIcon icon={IconMicrophone} size={16} />
            </button>
        </Tooltip>
    );

    // Save on top of the latest saved dashboard, so an agent's changes are kept.
    const handleSave = async () => {
        if (!projectUuid) return;
        setIsSaving(true);
        try {
            const latest = await getDashboard(
                lightdashApi,
                dashboard.uuid,
                projectUuid,
                includeUnpublishedDraft,
            ).catch(() => null);
            if (!latest) {
                showToastError({ title: 'Could not save the layout' });
                return;
            }
            const { tiles } = reapplyLayoutPreview(
                latest.tiles,
                pendingLayoutOps,
                DASHBOARD_GRID_COLUMNS,
            );
            // A failed save shows its own error.
            const saved = await saveDashboard(
                buildLayoutSaveBody(latest, tiles),
            ).catch(() => null);
            if (!saved) return;
            setPendingLayoutOps([]);
            setDashboardTiles(saved.tiles);
        } finally {
            setIsSaving(false);
        }
    };
    // Back to the saved tiles, which include anything an agent has changed.
    const handleDiscard = () => {
        setPendingLayoutOps([]);
        setDashboardTiles(dashboard.tiles);
    };

    return (
        <>
            <VoiceDesignTour surface="dashboard" />
            <CaptureHost
                ref={captureRef}
                surface={surface}
                onRecordingChange={setIsRecording}
            />
            <div className={classes.dock}>
                {pendingLayoutOps.length > 0 && (
                    <div className={classes.bar}>
                        <Text size="sm" c="white">
                            Layout changed, not saved
                        </Text>
                        <Button
                            size="compact-sm"
                            radius="xl"
                            variant="default"
                            onClick={handleDiscard}
                            disabled={isSaving}
                        >
                            Discard
                        </Button>
                        <Button
                            size="compact-sm"
                            radius="xl"
                            onClick={() => void handleSave()}
                            loading={isSaving}
                        >
                            Save
                        </Button>
                    </div>
                )}
                {isSorting && (
                    <div className={classes.bar}>
                        <Loader size="xs" color="white" />
                        <Text size="sm" c="white" pr="xs">
                            Sorting your requests
                        </Text>
                    </div>
                )}
            </div>
            {!isRecording &&
                !isSorting &&
                (dockExtras ? (
                    createPortal(micButton, dockExtras)
                ) : (
                    <div className={classes.corner}>{micButton}</div>
                ))}
        </>
    );
};

export default DashboardCapture;

import {
    DASHBOARD_GRID_COLUMNS,
    FeatureFlags,
    isDashboardChartTileType,
    type CaptureQuestion,
    type DashboardTile,
} from '@lightdash/common';
import { ActionIcon, Button, Loader, Text, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { transcribeCapture } from '../../../features/apps/utils/transcribeCapture';
import {
    selectActiveTabUuid,
    selectDashboardTiles,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import { getTileTitle } from '../../../features/dashboardControls/tileProps';
import { useUpdateDashboard } from '../../../hooks/dashboard/useDashboard';
import useToaster from '../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useLauncherDock } from '../aiCopilot/components/Launcher/useLauncherDock';
import {
    useCreateAgentThreadMutation,
    useProjectAiAgents,
} from '../aiCopilot/hooks/useProjectAiAgents';
import {
    openDefaultAgentPanel,
    openPanel,
} from '../aiCopilot/store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../aiCopilot/store/hooks';
import {
    CaptureHost,
    type CaptureHostHandle,
    type CaptureResult,
    type CaptureSurface,
    type CaptureTarget,
} from '../capture';
import { applyLayoutOps } from './applyLayoutOps';
import classes from './DashboardCapture.module.css';
import { buildLayoutSaveBody } from './layoutSaveBody';
import { routeCapture } from './routeCapture';
import {
    buildRouteRequest,
    cellAtPoint,
    cellTarget,
    imageToJpegBase64,
    tileTarget,
} from './routeRequest';

const UNTITLED = 'Untitled tile';
const MAX_ROUTE_IMAGES = 6;

const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

const questionsToPrompt = (questions: CaptureQuestion[]): string =>
    questions.length === 1
        ? questions[0].text
        : questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');

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

/** Point-and-talk on a dashboard: layout is done here, questions go to an agent. */
const DashboardCapture: FC = () => {
    const { mode } = useParams<{ mode?: string }>();
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const flag = useServerFeatureFlag(FeatureFlags.DashboardCapture);
    const agentDispatch = useAiAgentStoreDispatch();
    const { showToastInfo, showToastWarning, showToastError } = useToaster();

    const tilesRef = useRef<DashboardTile[]>([]);
    tilesRef.current = dashboardTiles ?? [];
    const captureRef = useRef<CaptureHostHandle>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isSorting, setIsSorting] = useState(false);
    // Tiles as they were before unsaved layout changes, for Discard.
    const [tilesBeforePreview, setTilesBeforePreview] = useState<
        DashboardTile[] | null
    >(null);

    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const agentUuid = agents?.[0]?.uuid ?? null;
    const { addItem: addDockItem } = useLauncherDock(projectUuid);
    const openedFirstThreadRef = useRef(true);
    const { mutateAsync: createThread } = useCreateAgentThreadMutation(
        projectUuid ?? '',
        {
            skipNavigation: true,
            onCreated: (thread) => {
                addDockItem({
                    threadId: thread.uuid,
                    agentUuid: thread.agentUuid,
                    title: thread.firstMessage.message,
                });
                if (openedFirstThreadRef.current) return;
                openedFirstThreadRef.current = true;
                agentDispatch(
                    openPanel({
                        threadId: thread.uuid,
                        agentUuid: thread.agentUuid,
                    }),
                );
            },
        },
    );

    const { mutate: saveDashboard, isLoading: isSaving } = useUpdateDashboard(
        dashboard?.uuid,
        projectUuid,
    );

    // Each question becomes its own analysis: a thread per question, all
    // docked in the launcher, with the first one opened.
    const sendQuestions = useCallback(
        (
            questions: CaptureQuestion[],
            tiles: DashboardTile[],
            dashboardUuid: string,
        ) => {
            const chartUuidFor = (question: CaptureQuestion) => {
                const about = tiles.find(
                    (tile) =>
                        question.tileUuids.includes(tile.uuid) &&
                        isDashboardChartTileType(tile),
                );
                return about && isDashboardChartTileType(about)
                    ? (about.properties.savedChartUuid ?? undefined)
                    : undefined;
            };
            if (!agentUuid) {
                // No agent list yet: fall back to one combined prompt.
                agentDispatch(
                    openDefaultAgentPanel({
                        pendingContext: {
                            dashboardUuid,
                            chartUuid: chartUuidFor(questions[0]),
                        },
                        pendingPrompt: questionsToPrompt(questions),
                    }),
                );
                return;
            }
            openedFirstThreadRef.current = false;
            questions.forEach((question) => {
                const chartUuid = chartUuidFor(question);
                void createThread({
                    agentUuid,
                    prompt: question.text,
                    context: [
                        { type: 'dashboard', dashboardUuid },
                        ...(chartUuid
                            ? [{ type: 'chart' as const, chartUuid }]
                            : []),
                    ],
                }).catch(() => {
                    showToastError({
                        title: 'Could not send a question to the agent',
                        subtitle: question.text,
                    });
                });
            });
        },
        [agentDispatch, agentUuid, createThread, showToastError],
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
                    tiles,
                    route.layout,
                    DASHBOARD_GRID_COLUMNS,
                );
                if (layout.applied > 0) {
                    setTilesBeforePreview((before) => before ?? tiles);
                    setDashboardTiles(layout.tiles);
                }

                if (route.questions.length > 0) {
                    sendQuestions(route.questions, tiles, dashboard.uuid);
                }

                if (layout.applied === 0 && route.questions.length === 0) {
                    showToastWarning({
                        title: 'Nothing to do',
                        subtitle:
                            'No layout change or question was found in that capture.',
                    });
                    return;
                }
                const parts = [
                    layout.applied > 0
                        ? `${plural(layout.applied, 'layout change')} ready to review`
                        : null,
                    route.questions.length > 0
                        ? `${plural(route.questions.length, 'question')} sent to the agent`
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
            projectUuid,
            sendQuestions,
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
                      resolveTarget: (point) =>
                          targetAtPoint(point, tilesRef.current),
                      transcribe: (audio) =>
                          transcribeCapture(projectUuid, audio),
                      onCapture: (result) =>
                          void handleCaptureRef.current(result),
                  }
                : null,
        [available, projectUuid],
    );

    if (!surface || !dashboard) return null;

    const handleSave = () => {
        saveDashboard(buildLayoutSaveBody(dashboard, tilesRef.current), {
            onSuccess: () => setTilesBeforePreview(null),
        });
    };
    const handleDiscard = () => {
        if (tilesBeforePreview) setDashboardTiles(tilesBeforePreview);
        setTilesBeforePreview(null);
    };

    return (
        <>
            <CaptureHost
                ref={captureRef}
                surface={surface}
                onRecordingChange={setIsRecording}
            />
            <div className={classes.dock}>
                {tilesBeforePreview && (
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
                            onClick={handleSave}
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
                {!isRecording && !isSorting && (
                    <Tooltip label="Point and talk" position="top">
                        <ActionIcon
                            size="xl"
                            radius="xl"
                            variant="filled"
                            color="dark"
                            aria-label="Point and talk"
                            onClick={() => captureRef.current?.start()}
                        >
                            <MantineIcon icon={IconMicrophone} size={20} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </div>
        </>
    );
};

export default DashboardCapture;

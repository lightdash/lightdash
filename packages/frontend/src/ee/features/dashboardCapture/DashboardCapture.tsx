import {
    DASHBOARD_GRID_COLUMNS,
    FeatureFlags,
    isDashboardChartTileType,
    type CaptureQuestion,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Loader, Text, Tooltip } from '@mantine/core';
import { IconMicrophone } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
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
import launcherClasses from '../aiCopilot/components/Launcher/AiAgentsLauncher.module.css';
import { useLauncherDockExtras } from '../aiCopilot/components/Launcher/launcherDockExtras';
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
    readFrameSource,
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
import { uploadCaptureImages } from './uploadCaptureImages';

const UNTITLED = 'Untitled tile';
const MAX_ROUTE_IMAGES = 5;
const IMAGES_NOTE =
    'The attached screenshots show the dashboard as I recorded it, with my red marks drawn on. Use them to see exactly what I was pointing at.';

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
    const dockExtras = useLauncherDockExtras();
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
    // Agent changes held back until the layout preview is resolved.
    const heldEditsRef = useRef<CaptureQuestion[]>([]);
    const heldImagesRef = useRef<string[]>([]);
    const [heldEditCount, setHeldEditCount] = useState(0);
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

    // Everything for the agent goes in one thread, as a numbered list.
    const sendQuestions = useCallback(
        (
            questions: CaptureQuestion[],
            tiles: DashboardTile[],
            dashboardUuid: string,
            images: string[],
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
            // One thread for the whole recording, so the agent has every
            // request in front of it and changes do not race each other.
            const chartUuid =
                questions.length === 1 ? chartUuidFor(questions[0]) : undefined;
            openedFirstThreadRef.current = false;
            void uploadCaptureImages(images)
                .then((imageUuids) =>
                    createThread({
                        agentUuid,
                        prompt:
                            imageUuids.length > 0
                                ? `${questionsToPrompt(questions)}\n\n${IMAGES_NOTE}`
                                : questionsToPrompt(questions),
                        context: [
                            { type: 'dashboard', dashboardUuid },
                            ...(chartUuid
                                ? [{ type: 'chart' as const, chartUuid }]
                                : []),
                            ...imageUuids.map((fileUuid) => ({
                                type: 'thread_image' as const,
                                fileUuid,
                            })),
                        ],
                    }),
                )
                .catch(() => {
                    showToastError({
                        title: 'Could not send your requests to the agent',
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

                // The agent saves its changes and the page reloads the
                // dashboard, which would wipe an unsaved layout. So agent
                // changes wait until the layout is saved or discarded.
                const edits = route.edits.map((edit) => ({
                    ...edit,
                    text: `Please make this change to the dashboard "${dashboard.name}": ${edit.text}`,
                }));
                const layoutPending =
                    layout.applied > 0 || heldEditsRef.current.length > 0;
                if (edits.length > 0 && layoutPending) {
                    heldEditsRef.current = [...heldEditsRef.current, ...edits];
                    heldImagesRef.current = images;
                    setHeldEditCount(heldEditsRef.current.length);
                }
                const forAgentNow = [
                    ...route.questions,
                    ...(layoutPending ? [] : edits),
                ];
                if (forAgentNow.length > 0) {
                    sendQuestions(forAgentNow, tiles, dashboard.uuid, images);
                }

                if (
                    layout.applied === 0 &&
                    route.questions.length === 0 &&
                    edits.length === 0
                ) {
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
                    route.questions.length > 0
                        ? `${plural(route.questions.length, 'question')} sent to the agent`
                        : null,
                    edits.length > 0
                        ? `${plural(edits.length, 'change')} ${
                              layoutPending
                                  ? 'for the agent once the layout is settled'
                                  : 'sent to the agent'
                          }`
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
                      // Spike: ?inlineCapture=dom draws the page from the DOM.
                      frameSource: readFrameSource(),
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

    const micButton = (
        <Tooltip label="Point and talk" position="top">
            <button
                type="button"
                aria-label="Point and talk"
                className={`${launcherClasses.dockTab} ${launcherClasses.dockIconTab} ${classes.mic}`}
                onClick={() => captureRef.current?.start()}
            >
                <MantineIcon icon={IconMicrophone} size={16} />
            </button>
        </Tooltip>
    );

    const releaseHeldEdits = () => {
        const edits = heldEditsRef.current;
        heldEditsRef.current = [];
        setHeldEditCount(0);
        if (edits.length > 0) {
            sendQuestions(
                edits,
                tilesRef.current,
                dashboard.uuid,
                heldImagesRef.current,
            );
        }
    };
    const handleSave = () => {
        saveDashboard(buildLayoutSaveBody(dashboard, tilesRef.current), {
            onSuccess: () => {
                setTilesBeforePreview(null);
                releaseHeldEdits();
            },
        });
    };
    const handleDiscard = () => {
        if (tilesBeforePreview) setDashboardTiles(tilesBeforePreview);
        setTilesBeforePreview(null);
        releaseHeldEdits();
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
                            {heldEditCount > 0 &&
                                `. ${plural(heldEditCount, 'change')} waiting for the agent`}
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

import {
    FeatureFlags,
    type AiPromptContextInput,
    type Dashboard,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Group, Tooltip, UnstyledButton } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import useIsEmbedded from '../../providers/Embed/useIsEmbedded';
import BubbleReplyPoster, {
    type BubbleReplyPost,
} from '../aiCopilot/components/BubbleThread/BubbleReplyPoster';
import { BubbleThread } from '../aiCopilot/components/BubbleThread/BubbleThread';
import launcherClasses from '../aiCopilot/components/Launcher/AiAgentsLauncher.module.css';
import { LauncherAgentPicker } from '../aiCopilot/components/Launcher/LauncherAgentPicker';
import { useLauncherDockExtras } from '../aiCopilot/components/Launcher/launcherDockExtras';
import { buildDesignPrompt } from '../capture/buildDesignPrompt';
import { chipLabel } from '../capture/chipLabel';
import {
    activeCollection,
    isInProgress,
    type Bubble,
    type DesignSession,
} from '../capture/designSession';
import {
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
} from '../capture/types';
import { useBubbleSend } from '../capture/useBubbleSend';
import { useDesignMode } from '../capture/useDesignMode';
import classes from './DashboardDesignMode.module.css';
import {
    chartUuidsForMarks,
    dashboardScroll,
    pickTileAt,
    targetAtPoint,
} from './tilePicker';

type Tab = Dashboard['tabs'][number];

type Props = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardName: string;
};

/** Design Mode on a dashboard: mark tiles, say what to change, read the reply there. */
const DashboardDesignSurface: FC<Props> = ({
    projectUuid,
    dashboardUuid,
    dashboardName,
}) => {
    const dockExtras = useLauncherDockExtras();
    const lightdashApi = useLightdashApi();
    const { health } = useApp();
    const setActiveTab = useDashboardContext((c) => c.setActiveTab);
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);

    const tabs: Tab[] = useMemo(() => dashboardTabs ?? [], [dashboardTabs]);
    const activeTab = tabs.find((tab) => tab.uuid === activeTabUuid) ?? null;
    // Read through refs so the surface keeps a stable identity.
    const tilesRef = useRef<DashboardTile[]>([]);
    tilesRef.current = dashboardTiles ?? [];
    const activeTabRef = useRef<Tab | null>(null);
    activeTabRef.current = activeTab;
    const sessionRef = useRef<DesignSession | null>(null);
    // How to reply in each sent bubble's conversation.
    const postersRef = useRef(new Map<string, BubbleReplyPost>());
    // What was mentioned in a reply's composer, kept until that reply is sent.
    const replyContextRef = useRef(new Map<string, AiPromptContextInput>());

    const {
        send: sendBubble,
        cancel: cancelSend,
        picker,
    } = useBubbleSend(projectUuid);

    const voiceTranscriptionAvailable =
        health.data?.ai.voiceTranscriptionAvailable;
    const surface = useMemo<DesignSurface>(() => {
        const tilesOnTab = () => {
            const tabUuid = activeTabRef.current?.uuid ?? null;
            return tilesRef.current.filter(
                (tile) => !tabUuid || tile.tabUuid === tabUuid,
            );
        };
        return {
            // The whole page is drawable; marks find their own tile.
            getRegion: () =>
                new DOMRect(0, 0, window.innerWidth, window.innerHeight),
            getScroll: dashboardScroll,
            // Drawn from the page itself, so there is no share prompt.
            frameSource: 'dom',
            grabAppImage: null,
            getTab: () => {
                const tab = activeTabRef.current;
                return tab ? { uuid: tab.uuid, name: tab.name } : null;
            },
            resolveTarget: (point) => targetAtPoint(point, tilesOnTab()),
            pickAt: (point) => pickTileAt(point, tilesOnTab()),
            transcribe: captureTranscriber(
                lightdashApi,
                projectUuid,
                voiceTranscriptionAvailable,
            ),
        };
    }, [lightdashApi, projectUuid, voiceTranscriptionAvailable]);

    const onSend = useCallback(
        async (payload: DesignPayload): Promise<DesignSendResult> => {
            const charts = chartUuidsForMarks(
                payload.marks,
                tilesRef.current,
            ).map((chartUuid) => ({ type: 'chart' as const, chartUuid }));
            const prompt = (surfaceHeading: string) => (hasImages: boolean) =>
                buildDesignPrompt({
                    surfaceHeading,
                    summary: payload.summary,
                    typed: payload.typed,
                    hasImages,
                });

            const bubble = sessionRef.current?.bubbles.find(
                (b) => b.id === payload.bubbleId,
            );
            if (bubble?.threadId && bubble.agentUuid) {
                // A reply: the conversation already knows its dashboard.
                const post = postersRef.current.get(bubble.id);
                if (!post) throw new Error('The conversation is not open');
                const mentioned = replyContextRef.current.get(bubble.id) ?? [];
                replyContextRef.current.delete(bubble.id);
                await post({
                    buildPrompt: prompt(''),
                    images: payload.images,
                    context: [...mentioned, ...charts],
                });
                return {
                    threadId: bubble.threadId,
                    agentUuid: bubble.agentUuid,
                };
            }

            return sendBubble({
                bubbleId: payload.bubbleId,
                buildPrompt: prompt(
                    `These requests are about the dashboard "${dashboardName}".`,
                ),
                images: payload.images,
                context: [{ type: 'dashboard', dashboardUuid }, ...charts],
            });
        },
        [dashboardName, dashboardUuid, sendBubble],
    );

    // Set below, once the hook that needs this function has run.
    const designRef = useRef<ReturnType<typeof useDesignMode> | null>(null);

    const renderBubbleBody = (
        bubble: Bubble,
        session: DesignSession,
    ): ReactNode => {
        if (bubble.status === 'picking-agent') {
            return picker?.bubbleId === bubble.id ? (
                <LauncherAgentPicker
                    candidates={picker.candidates}
                    onPick={picker.onPick}
                    waitingPrompt={null}
                />
            ) : null;
        }
        const { threadId, agentUuid } = bubble;
        if (bubble.status !== 'thread' || !threadId || !agentUuid) return null;

        const active = activeCollection(session);
        const armed =
            session.active.kind === 'bubble' &&
            session.active.bubbleId === bubble.id;
        const collecting =
            active !== null &&
            (active.bubble.input === 'mic' || isInProgress(active.collection));
        const homeTab = tabs.find((tab) => tab.uuid === bubble.homeTabUuid);
        // Marks made on another tab are not on screen beside this bubble.
        const elsewhere = bubble.sentMarks.flatMap((mark) => {
            const tab = tabs.find(
                (candidate) => candidate.name === mark.tabName,
            );
            return tab && tab.uuid !== homeTab?.uuid ? [{ mark, tab }] : [];
        });

        return (
            <>
                {elsewhere.length > 0 && (
                    <Group gap={4} mb={6}>
                        {elsewhere.map(({ mark, tab }) => (
                            <Button
                                key={mark.number}
                                size="compact-xs"
                                variant="light"
                                color="red"
                                onClick={() => setActiveTab(tab)}
                            >
                                {`${chipLabel(mark.number)} on ${tab.name}`}
                            </Button>
                        ))}
                    </Group>
                )}
                <BubbleThread
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadId={threadId}
                    armed={armed}
                    onArm={(input) => designRef.current?.arm(bubble.id, input)}
                    replyCollecting={collecting}
                    onSendReply={(prompt, context) => {
                        replyContextRef.current.set(bubble.id, context);
                        designRef.current?.send(bubble.id, prompt);
                        return Promise.resolve();
                    }}
                    // The bubble draws its own close button.
                    onClose={null}
                />
            </>
        );
    };

    const design = useDesignMode(surface, {
        onSend,
        renderBubbleBody,
        picker,
        cancelSend,
    });
    designRef.current = design;
    sessionRef.current = design.session;

    const registerPoster = useCallback(
        (bubbleId: string, post: BubbleReplyPost | null) => {
            if (post) postersRef.current.set(bubbleId, post);
            else postersRef.current.delete(bubbleId);
        },
        [],
    );

    const toggle = (
        <Tooltip label="Design Mode" position="top">
            <UnstyledButton
                aria-label="Design Mode"
                aria-pressed={design.on}
                className={`${launcherClasses.dockTab} ${launcherClasses.dockIconTab} ${classes.toggle}`}
                onClick={() => design.setOn(!design.on)}
            >
                <MantineIcon icon={IconPencil} size={16} />
            </UnstyledButton>
        </Tooltip>
    );

    return (
        <>
            {design.element}
            {design.session.bubbles.map((bubble) =>
                bubble.threadId && bubble.agentUuid ? (
                    <BubbleReplyPoster
                        key={bubble.id}
                        projectUuid={projectUuid}
                        agentUuid={bubble.agentUuid}
                        threadId={bubble.threadId}
                        bubbleId={bubble.id}
                        register={registerPoster}
                    />
                ) : null,
            )}
            {dockExtras ? (
                createPortal(toggle, dockExtras)
            ) : (
                <div className={classes.corner}>{toggle}</div>
            )}
        </>
    );
};

/** Offers Design Mode on a dashboard that is being viewed, never in an embed. */
const DashboardDesignMode: FC = () => {
    const { mode } = useParams<{ mode?: string }>();
    const isEmbedded = useIsEmbedded();
    const flag = useServerFeatureFlag(FeatureFlags.DashboardCapture);
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);

    if (!flag.data?.enabled || mode === 'edit' || isEmbedded) return null;
    if (!projectUuid || !dashboard) return null;

    return (
        <DashboardDesignSurface
            projectUuid={projectUuid}
            dashboardUuid={dashboard.uuid}
            dashboardName={dashboard.name}
        />
    );
};

export default DashboardDesignMode;

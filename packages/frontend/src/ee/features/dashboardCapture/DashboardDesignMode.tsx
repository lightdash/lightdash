import {
    FeatureFlags,
    type Dashboard,
    type DashboardTile,
} from '@lightdash/common';
import { Badge, Button, Group, Tooltip, UnstyledButton } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type FC,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import {
    selectActiveTabUuid,
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import {
    getDashboardTabPath,
    getDashboardUrlIdentifier,
} from '../../../features/dashboardTabs/tabUrl';
import { useProjectUrlIdentifier } from '../../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import useIsEmbedded from '../../providers/Embed/useIsEmbedded';
import launcherClasses from '../aiCopilot/components/Launcher/AiAgentsLauncher.module.css';
import { useLauncherDockExtras } from '../aiCopilot/components/Launcher/launcherDockExtras';
import { useDefaultAiAgent } from '../aiCopilot/components/Launcher/useDefaultAiAgent';
import { useProjectAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { type Bubble } from '../capture/designSession';
import {
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
} from '../capture/types';
import { useBubbleConversations } from '../capture/useBubbleConversations';
import { useDesignMode } from '../capture/useDesignMode';
import classes from './DashboardDesignMode.module.css';
import { pickPartAt } from './partPicker';
import {
    chartUuidsForMarks,
    dashboardScroll,
    dashboardScrollContainer,
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
    const navigate = useNavigate();
    const { search } = useLocation();
    const { dashboardUuid: routeDashboardUuidOrSlug } = useParams<{
        dashboardUuid: string;
    }>();
    const dashboardSlug = useDashboardContext((c) => c.dashboard?.slug);
    const projectUrlIdentifier = useProjectUrlIdentifier();
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
    const conversations = useBubbleConversations(projectUuid);
    const { send: sendMessage } = conversations;

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
            getScrollContainer: dashboardScrollContainer,
            // The dashboard scrolls with the window.
            watchScroll: null,
            // Drawn from the page itself, so there is no share prompt.
            frameSource: 'dom',
            grabAppImage: null,
            getTab: () => {
                const tab = activeTabRef.current;
                return tab ? { uuid: tab.uuid, name: tab.name } : null;
            },
            // Ink names the bar or cell it lands on, like a pick does.
            resolveTarget: (point) =>
                pickPartAt(point, tilesOnTab())?.target ??
                targetAtPoint(point, tilesOnTab()),
            pickAt: (point) => pickPartAt(point, tilesOnTab()),
            transcribe: captureTranscriber(
                lightdashApi,
                projectUuid,
                voiceTranscriptionAvailable,
            ),
        };
    }, [lightdashApi, projectUuid, voiceTranscriptionAvailable]);

    const onSend = useCallback(
        (payload: DesignPayload): Promise<DesignSendResult> =>
            sendMessage(payload, {
                heading: `These requests are about the dashboard "${dashboardName}".`,
                about: [{ type: 'dashboard', dashboardUuid }],
                marked: chartUuidsForMarks(payload.marks, tilesRef.current).map(
                    (chartUuid) => ({ type: 'chart' as const, chartUuid }),
                ),
            }),
        [dashboardName, dashboardUuid, sendMessage],
    );

    // The tab is read from the address, so go there the way the tab bar does.
    const goToTab = (tab: Tab) =>
        navigate(
            {
                pathname: getDashboardTabPath({
                    projectUrlIdentifier,
                    dashboardUrlIdentifier: getDashboardUrlIdentifier({
                        routeDashboardUuidOrSlug,
                        dashboardSlug,
                    }),
                    isEditMode: false,
                    tabUuid: tab.uuid,
                }),
                search,
            },
            { replace: true },
        );

    // Marks made on another tab are not on screen beside their bubble.
    const marksElsewhere = (bubble: Bubble): ReactNode => {
        const homeTab = tabs.find((tab) => tab.uuid === bubble.homeTabUuid);
        const elsewhere = bubble.sentMarks.flatMap((mark) => {
            const tab = tabs.find(
                (candidate) => candidate.name === mark.tabName,
            );
            return tab && tab.uuid !== homeTab?.uuid ? [{ mark, tab }] : [];
        });
        if (elsewhere.length === 0) return null;
        return (
            <Group gap={4} mb={6}>
                {elsewhere.map(({ mark, tab }) => (
                    <Button
                        key={mark.number}
                        size="compact-xs"
                        variant="default"
                        aria-label={`Mark ${mark.number} on ${tab.name}`}
                        leftSection={
                            <Badge
                                circle
                                size="sm"
                                color="red"
                                variant="filled"
                            >
                                {mark.number}
                            </Badge>
                        }
                        onClick={() => void goToTab(tab)}
                    >
                        {`on ${tab.name}`}
                    </Button>
                ))}
            </Group>
        );
    };

    const design = useDesignMode(surface, {
        onSend,
        renderBubbleBody: (bubble, session) =>
            conversations.renderBody(bubble, session, marksElsewhere(bubble)),
        picker: conversations.picker,
        cancelSend: conversations.cancelSend,
        onBubbleRemoved: null,
    });
    conversations.attach(design);

    // Tiles added, moved or removed, as by an agent's edit: a new screen.
    const tileLayout = useMemo(
        () => JSON.stringify(dashboardTiles ?? []),
        [dashboardTiles],
    );
    const { screenChanged } = design;
    useEffect(() => screenChanged(), [screenChanged, tileLayout]);

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
            {conversations.renderPosters(design.session)}
            {dockExtras ? (
                createPortal(toggle, dockExtras)
            ) : (
                <div className={classes.corner}>{toggle}</div>
            )}
        </>
    );
};

/** Offers Design Mode on a dashboard that is being viewed by someone with an agent to send to, never in an embed. */
const DashboardDesignMode: FC = () => {
    const { mode } = useParams<{ mode?: string }>();
    const isEmbedded = useIsEmbedded();
    const flag = useServerFeatureFlag(FeatureFlags.DashboardCapture);
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    // Every bubble goes to an agent: no agent, nothing to offer.
    const canUseAgents = useProjectAiAgentButtonVisibility(projectUuid);
    const hasAgent = useDefaultAiAgent(projectUuid).agents.length > 0;

    if (!flag.data?.enabled || mode === 'edit' || isEmbedded) return null;
    if (!projectUuid || !dashboard) return null;
    if (!canUseAgents || !hasAgent) return null;

    return (
        <DashboardDesignSurface
            projectUuid={projectUuid}
            dashboardUuid={dashboard.uuid}
            dashboardName={dashboard.name}
        />
    );
};

export default DashboardDesignMode;
